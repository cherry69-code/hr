import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import { createTenant, createUser, findTenantBySlug, findUserByEmail } from './repository';
import { decryptString, encryptString, sha256Hex } from '../../utils/crypto';

const refreshExpiresMs = 30 * 24 * 60 * 60 * 1000;

const newId = () => crypto.randomUUID();

const issueAccessToken = (app: FastifyInstance, user: any) =>
  app.jwt.sign({ sub: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id }, { expiresIn: '15m' });

const issueRefreshToken = async (app: FastifyInstance, user: any, familyId?: string) => {
  const fid = familyId || newId();
  const jti = newId();
  const now = Date.now();
  const expiresAt = new Date(now + refreshExpiresMs);
  const jti_hash = sha256Hex(jti);
  await app.prisma.auth_refresh_tokens.create({
    data: {
      tenant_id: user.tenant_id,
      user_id: user.id,
      family_id: fid,
      jti_hash,
      expires_at: expiresAt
    } as any
  });
  const refreshToken = app.jwt.sign({ sub: user.id, type: 'refresh', tenant_id: user.tenant_id, jti, fid }, { expiresIn: '30d' });
  return { refreshToken, fid, jti_hash, expiresAt };
};

const audit = async (app: FastifyInstance, tenantId: string, actor: { userId?: string; email?: string }, action: string, meta?: any) => {
  await app.prisma.audit_logs
    .create({
      data: {
        tenant_id: tenantId,
        actor_user_id: actor.userId ? String(actor.userId) : null,
        actor_email: actor.email ? String(actor.email) : null,
        action,
        entity_type: 'auth',
        entity_id: actor.userId ? String(actor.userId) : null,
        meta: meta ?? {}
      }
    } as any)
    .catch(() => {});
};

export const bootstrapAdmin = async (
  app: FastifyInstance,
  body: { token: string; email: string; password: string; role?: string; tenant_slug?: string }
) => {
  const expected = String(process.env.BOOTSTRAP_TOKEN || '').trim();
  if (!expected || body.token !== expected) {
    return { ok: false as const, error: 'invalid bootstrap token' };
  }
  const tenantSlug = String(body.tenant_slug || 'default').trim().toLowerCase();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const role = String(body.role || 'super_admin');
  if (!email || !password) return { ok: false as const, error: 'email and password required' };

  let tenant = await findTenantBySlug(app.prismaRead, tenantSlug);
  if (!tenant) tenant = await createTenant(app.prisma, { name: tenantSlug, slug: tenantSlug });

  const existing = await findUserByEmail(app.prismaRead, { tenant_id: tenant.id, email });
  if (existing) return { ok: true as const, user: { id: existing.id, email: existing.email, role: existing.role, tenant_id: existing.tenant_id } };

  const password_hash = await bcrypt.hash(password, 10);
  const created = await createUser(app.prisma, { tenant_id: tenant.id, email, password_hash, role });
  return { ok: true as const, user: { id: created.id, email: created.email, role: created.role, tenant_id: created.tenant_id } };
};

export const login = async (app: FastifyInstance, body: { email: string; password: string; tenant_slug?: string }) => {
  const tenantSlug = String(body.tenant_slug || 'default').trim().toLowerCase();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const tenant = await findTenantBySlug(app.prismaRead, tenantSlug);
  if (!tenant) return { ok: false as const, error: 'invalid tenant' };

  const user = await findUserByEmail(app.prismaRead, { tenant_id: tenant.id, email });
  if (!user) return { ok: false as const, error: 'invalid credentials' };
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return { ok: false as const, error: 'invalid credentials' };

  if ((user as any).two_factor_enabled) {
    const rawSecret = (user as any).two_factor_secret ? String((user as any).two_factor_secret) : '';
    if (!rawSecret) return { ok: false as const, error: '2fa_required' };
    const totp = (body as any).totp ? String((body as any).totp).trim() : '';
    const backup = (body as any).backup_code ? String((body as any).backup_code).trim() : '';
    if (!totp && !backup) return { ok: false as const, error: '2fa_required' };
    const secret = decryptString(rawSecret);

    if (totp) {
      const ok = authenticator.check(totp, secret);
      if (!ok) return { ok: false as const, error: 'invalid_2fa' };
    } else {
      const hashed = sha256Hex(backup);
      const codes = Array.isArray((user as any).two_factor_backup_codes) ? (user as any).two_factor_backup_codes : [];
      if (!codes.includes(hashed)) return { ok: false as const, error: 'invalid_2fa' };
      const next = codes.filter((c: any) => c !== hashed);
      await app.prisma.auth_users.update({ where: { id: user.id }, data: { two_factor_backup_codes: next } as any }).catch(() => {});
    }
  }

  const accessToken = issueAccessToken(app, user);
  const { refreshToken } = await issueRefreshToken(app, user);
  await audit(app, String((user as any).tenant_id), { userId: user.id, email: user.email }, 'auth.login', {});
  return { ok: true as const, accessToken, refreshToken, role: user.role, tenant_id: user.tenant_id };
};

export const refresh = async (app: FastifyInstance, body: { refreshToken: string }) => {
  const token = String(body.refreshToken || '').trim();
  if (!token) return { ok: false as const, error: 'missing refresh token' };
  let payload: any;
  try {
    payload = app.jwt.verify(token);
  } catch {
    return { ok: false as const, error: 'invalid refresh token' };
  }
  if (payload?.type !== 'refresh' || !payload?.sub || !payload?.jti) return { ok: false as const, error: 'invalid refresh token' };

  const tenantId = String(payload?.tenant_id || '').trim();
  if (!tenantId) return { ok: false as const, error: 'invalid refresh token' };
  const user = await app.prismaRead.auth_users.findUnique({ where: { id: String(payload.sub) } });
  if (!user) return { ok: false as const, error: 'user not found' };
  if (String((user as any).tenant_id) !== tenantId) return { ok: false as const, error: 'invalid refresh token' };

  const jti_hash = sha256Hex(String(payload.jti));
  const record = await app.prisma.auth_refresh_tokens.findUnique({ where: { jti_hash } as any }).catch(() => null);
  if (!record) {
    const fid = payload?.fid ? String(payload.fid) : '';
    if (fid) await app.prisma.auth_refresh_tokens.updateMany({ where: { family_id: fid } as any, data: { revoked_at: new Date() } as any }).catch(() => {});
    return { ok: false as const, error: 'invalid refresh token' };
  }

  if (record.revoked_at) {
    await app.prisma.auth_refresh_tokens.updateMany({ where: { family_id: record.family_id } as any, data: { revoked_at: new Date() } as any }).catch(() => {});
    return { ok: false as const, error: 'invalid refresh token' };
  }
  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await app.prisma.auth_refresh_tokens.update({ where: { id: record.id } as any, data: { revoked_at: new Date() } as any }).catch(() => {});
    return { ok: false as const, error: 'invalid refresh token' };
  }
  if (String(record.user_id) !== String(user.id) || String(record.tenant_id) !== tenantId) return { ok: false as const, error: 'invalid refresh token' };

  const accessToken = issueAccessToken(app, user);
  const rotated = await issueRefreshToken(app, user, String(record.family_id));
  await app.prisma.auth_refresh_tokens
    .update({
      where: { id: record.id } as any,
      data: { revoked_at: new Date(), replaced_by_hash: rotated.jti_hash } as any
    })
    .catch(() => {});
  await audit(app, tenantId, { userId: user.id, email: user.email }, 'auth.refresh', {});
  return { ok: true as const, accessToken, refreshToken: rotated.refreshToken, tenant_id: (user as any).tenant_id };
};

export const logout = async (app: FastifyInstance, tenantId: string, userId: string, body: { refreshToken: string }) => {
  const token = String(body.refreshToken || '').trim();
  if (!token) return { ok: false as const, error: 'missing refresh token' };
  let payload: any;
  try {
    payload = app.jwt.verify(token);
  } catch {
    return { ok: false as const, error: 'invalid refresh token' };
  }
  if (payload?.type !== 'refresh' || !payload?.sub || !payload?.jti) return { ok: false as const, error: 'invalid refresh token' };
  if (String(payload.sub) !== String(userId) || String(payload.tenant_id) !== String(tenantId)) return { ok: false as const, error: 'invalid refresh token' };
  const jti_hash = sha256Hex(String(payload.jti));
  await app.prisma.auth_refresh_tokens.updateMany({ where: { jti_hash } as any, data: { revoked_at: new Date() } as any }).catch(() => {});
  await audit(app, tenantId, { userId, email: '' }, 'auth.logout', {});
  return { ok: true as const };
};

export const setup2fa = async (app: FastifyInstance, tenantId: string, userId: string) => {
  const user = await app.prismaRead.auth_users.findFirst({ where: { id: userId, tenant_id: tenantId } as any }).catch(() => null);
  if (!user) return { ok: false as const, error: 'user not found' };
  const secret = authenticator.generateSecret();
  const otpauth_url = authenticator.keyuri(String((user as any).email || 'user'), 'prophr', secret);
  await app.prisma.auth_users
    .update({
      where: { id: userId } as any,
      data: { two_factor_enabled: false, two_factor_secret: encryptString(secret), two_factor_backup_codes: [] } as any
    })
    .catch(() => {});
  await audit(app, tenantId, { userId, email: String((user as any).email || '') }, 'auth.2fa.setup', {});
  return { ok: true as const, data: { secret, otpauth_url } };
};

export const enable2fa = async (app: FastifyInstance, tenantId: string, userId: string, body: { totp: string }) => {
  const user = await app.prismaRead.auth_users.findFirst({ where: { id: userId, tenant_id: tenantId } as any }).catch(() => null);
  if (!user) return { ok: false as const, error: 'user not found' };
  const rawSecret = (user as any).two_factor_secret ? String((user as any).two_factor_secret) : '';
  if (!rawSecret) return { ok: false as const, error: '2fa_not_initialized' };
  const secret = decryptString(rawSecret);
  const totp = String(body.totp || '').trim();
  if (!totp) return { ok: false as const, error: 'totp_required' };
  if (!authenticator.check(totp, secret)) return { ok: false as const, error: 'invalid_2fa' };

  const backupCodes = Array.from({ length: 10 }).map(() => crypto.randomBytes(8).toString('hex'));
  const hashes = backupCodes.map((c) => sha256Hex(c));
  await app.prisma.auth_users
    .update({ where: { id: userId } as any, data: { two_factor_enabled: true, two_factor_backup_codes: hashes } as any })
    .catch(() => {});
  await audit(app, tenantId, { userId, email: String((user as any).email || '') }, 'auth.2fa.enabled', {});
  return { ok: true as const, data: { backup_codes: backupCodes } };
};

export const disable2fa = async (app: FastifyInstance, tenantId: string, userId: string, body: { totp?: string; backup_code?: string }) => {
  const user = await app.prismaRead.auth_users.findFirst({ where: { id: userId, tenant_id: tenantId } as any }).catch(() => null);
  if (!user) return { ok: false as const, error: 'user not found' };
  if (!(user as any).two_factor_enabled) return { ok: true as const };
  const rawSecret = (user as any).two_factor_secret ? String((user as any).two_factor_secret) : '';
  const totp = body.totp ? String(body.totp).trim() : '';
  const backup = body.backup_code ? String(body.backup_code).trim() : '';
  if (!totp && !backup) return { ok: false as const, error: '2fa_required' };

  if (totp) {
    if (!rawSecret) return { ok: false as const, error: 'invalid_2fa' };
    const secret = decryptString(rawSecret);
    if (!authenticator.check(totp, secret)) return { ok: false as const, error: 'invalid_2fa' };
  } else {
    const hashed = sha256Hex(backup);
    const codes = Array.isArray((user as any).two_factor_backup_codes) ? (user as any).two_factor_backup_codes : [];
    if (!codes.includes(hashed)) return { ok: false as const, error: 'invalid_2fa' };
  }

  await app.prisma.auth_users
    .update({ where: { id: userId } as any, data: { two_factor_enabled: false, two_factor_secret: null, two_factor_backup_codes: [] } as any })
    .catch(() => {});
  await audit(app, tenantId, { userId, email: String((user as any).email || '') }, 'auth.2fa.disabled', {});
  return { ok: true as const };
};

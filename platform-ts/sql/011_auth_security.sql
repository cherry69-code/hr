ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS two_factor_secret text;

ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS two_factor_backup_codes jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  jti_hash text NOT NULL,
  replaced_by_hash text,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_refresh_tokens_jti_hash_uq ON auth_refresh_tokens (jti_hash);
CREATE INDEX IF NOT EXISTS auth_refresh_tokens_tenant_user_idx ON auth_refresh_tokens (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS auth_refresh_tokens_family_idx ON auth_refresh_tokens (family_id);


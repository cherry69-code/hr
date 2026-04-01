import type Redis from 'ioredis';

type Entry = { value: unknown; expiresAt: number };
const memory = new Map<string, Entry>();

const nowMs = () => Date.now();

const memGet = <T>(key: string): T | null => {
  const e = memory.get(key);
  if (!e) return null;
  if (e.expiresAt && e.expiresAt <= nowMs()) {
    memory.delete(key);
    return null;
  }
  return e.value as T;
};

const memSet = (key: string, value: unknown, ttlMs: number) => {
  memory.set(key, { value, expiresAt: ttlMs ? nowMs() + ttlMs : 0 });
};

const memDel = (key: string) => {
  memory.delete(key);
};

const memClearPrefix = (prefix: string) => {
  for (const k of memory.keys()) {
    if (k.startsWith(prefix)) memory.delete(k);
  }
};

const tagSetKey = (tag: string) => `cache:tag:${tag}`;

export const cacheTagAdd = async (redis: Redis, key: string, tags: string[], ttlSec: number) => {
  const list = Array.from(new Set(tags.map((t) => String(t || '').trim()).filter(Boolean)));
  if (!list.length) return;
  const expireSec = Math.min(7 * 24 * 60 * 60, Math.max(60, ttlSec));
  const p: any = (redis as any).pipeline();
  for (const tag of list) {
    p.sadd(tagSetKey(tag), key);
    p.expire(tagSetKey(tag), expireSec);
  }
  await p.exec().catch(() => {});
};

export const cacheInvalidateTags = async (redis: Redis, tags: string[]) => {
  const list = Array.from(new Set(tags.map((t) => String(t || '').trim()).filter(Boolean)));
  if (!list.length) return;
  for (const tag of list) {
    const setKey = tagSetKey(tag);
    const keys = await redis.smembers(setKey).catch(() => []);
    if (keys.length) {
      for (const k of keys) memDel(String(k));
      const chunkSize = 500;
      for (let i = 0; i < keys.length; i += chunkSize) {
        await redis.del(keys.slice(i, i + chunkSize)).catch(() => {});
      }
    }
    await redis.del(setKey).catch(() => {});
  }
};

export const cacheGetJson = async <T>(redis: Redis, key: string): Promise<T | null> => {
  const m = memGet<T>(key);
  if (m !== null) return m;
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as T;
    memSet(key, parsed, 15000);
    return parsed;
  } catch {
    return null;
  }
};

export const cacheSetJson = async (redis: Redis, key: string, value: unknown, ttlSec: number) => {
  const body = JSON.stringify(value);
  memSet(key, value, Math.min(15000, Math.max(1, ttlSec) * 1000));
  if (ttlSec > 0) await redis.set(key, body, 'EX', ttlSec);
  else await redis.set(key, body);
};

export const cacheSetJsonTagged = async (redis: Redis, key: string, value: unknown, ttlSec: number, tags: string[]) => {
  await cacheSetJson(redis, key, value, ttlSec);
  await cacheTagAdd(redis, key, tags, ttlSec);
};

export const cacheDel = async (redis: Redis, key: string) => {
  memDel(key);
  await redis.del(key);
};

export const cacheClearPrefix = async (redis: Redis, prefix: string) => {
  memClearPrefix(prefix);
  const stream: any = (redis as any).scanStream({ match: `${prefix}*`, count: 200 });
  const deletes: Array<Promise<any>> = [];
  stream.on('data', (keys: string[]) => {
    if (keys && keys.length) deletes.push(redis.del(keys));
  });
  await new Promise<void>((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  if (deletes.length) await Promise.all(deletes);
};

export const subscribeCacheInvalidation = async (redisSub: Redis, redis: Redis) => {
  await redisSub.subscribe('cache.invalidate');
  redisSub.on('message', async (_channel, message) => {
    let parsed: any = null;
    try {
      parsed = JSON.parse(String(message || ''));
    } catch {
      return;
    }
    const keys: string[] = Array.isArray(parsed?.keys) ? parsed.keys : [];
    const prefixes: string[] = Array.isArray(parsed?.prefixes) ? parsed.prefixes : [];
    const tags: string[] = Array.isArray(parsed?.tags) ? parsed.tags : [];
    for (const k of keys) {
      if (k) await cacheDel(redis, String(k));
    }
    for (const p of prefixes) {
      if (p) await cacheClearPrefix(redis, String(p));
    }
    if (tags.length) await cacheInvalidateTags(redis, tags);
  });
};

import type Redis from 'ioredis';

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
      const chunkSize = 500;
      for (let i = 0; i < keys.length; i += chunkSize) {
        await redis.del(keys.slice(i, i + chunkSize)).catch(() => {});
      }
    }
    await redis.del(setKey).catch(() => {});
  }
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
    const tags: string[] = Array.isArray(parsed?.tags) ? parsed.tags : [];
    if (keys.length) {
      const chunkSize = 500;
      for (let i = 0; i < keys.length; i += chunkSize) {
        await redis.del(keys.slice(i, i + chunkSize)).catch(() => {});
      }
    }
    if (tags.length) await cacheInvalidateTags(redis, tags);
  });
};


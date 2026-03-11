const cache = new Map();

const nowMs = () => Date.now();

const get = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const set = (key, value, ttlMs) => {
  cache.set(key, { value, expiresAt: nowMs() + ttlMs });
};

const invalidatePrefix = (prefix) => {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
};

const invalidateAll = () => cache.clear();

module.exports = { get, set, invalidatePrefix, invalidateAll };

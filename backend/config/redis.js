const Redis = require('ioredis');

let client;

const buildClient = () => {
  const url = process.env.REDIS_URL ? String(process.env.REDIS_URL).trim() : '';
  if (!url) return null;
  const c = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 200,
    keepAlive: 10000
  });
  c.connect().catch(() => {});
  return c;
};

const getRedis = () => {
  if (client) return client;
  client = buildClient();
  return client;
};

module.exports = { getRedis };


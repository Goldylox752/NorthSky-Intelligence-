const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL);

async function get(key) {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

async function set(key, value, ttl = 3600) {
  await redis.set(key, JSON.stringify(value), "EX", ttl);
}

module.exports = { get, set };
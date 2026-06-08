const redis = require("../redis");
const config = require("../../config");

async function getState(guildId, channelId) {
  const key = config.COUNTING_KEY(guildId, channelId);
  const data = await redis.hgetall(key);
  if (!data || !data.active) return null;
  return {
    active: data.active === "true",
    currentNumber: parseInt(data.currentNumber) || 1,
    lastUserId: data.lastUserId || null,
  };
}

async function setActive(guildId, channelId, active) {
  const key = config.COUNTING_KEY(guildId, channelId);
  if (active) {
    await redis.hset(key, { active: "true", currentNumber: "1", lastUserId: "" });
  } else {
    await redis.del(key);
  }
}

async function increment(guildId, channelId, userId) {
  const key = config.COUNTING_KEY(guildId, channelId);
  await redis.hincrby(key, "currentNumber", 1);
  await redis.hset(key, "lastUserId", userId);
}

async function reset(guildId, channelId) {
  const key = config.COUNTING_KEY(guildId, channelId);
  await redis.hset(key, "currentNumber", "1", "lastUserId", "");
}

module.exports = { getState, setActive, increment, reset };

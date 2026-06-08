const redis = require("../redis");
const config = require("../../config");

async function startRace(channelId, word) {
  const key = config.PICTURE_RACE_KEY(channelId);
  await redis.setex(key, 30, JSON.stringify({ word, active: true, winner: null }));
}

async function getRace(channelId) {
  const data = await redis.get(config.PICTURE_RACE_KEY(channelId));
  return data ? JSON.parse(data) : null;
}

async function endRace(channelId, winnerId = null) {
  const key = config.PICTURE_RACE_KEY(channelId);
  if (winnerId) {
    await redis.setex(key, 10, JSON.stringify({ winner: winnerId, active: false }));
  } else {
    await redis.del(key);
  }
}

module.exports = { startRace, getRace, endRace };

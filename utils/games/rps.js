const redis = require("../redis");
const config = require("../../config");

async function createChallenge(challengeId, challengerId, targetId, channelId) {
  const key = config.RPS_KEY(challengeId);
  await redis.setex(key, 60, JSON.stringify({
    challenger: challengerId,
    target: targetId,
    channelId,
    status: "pending"
  }));
  return key;
}

async function getChallenge(challengeId) {
  const data = await redis.get(config.RPS_KEY(challengeId));
  return data ? JSON.parse(data) : null;
}

async function deleteChallenge(challengeId) {
  await redis.del(config.RPS_KEY(challengeId));
}

module.exports = { createChallenge, getChallenge, deleteChallenge };

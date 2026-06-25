// utils/activity.js – Activity feed helper
async function addActivity(redis, userId, activity) {
  const key = `profile:${userId}:activityFeed`;
  const timestamp = new Date().toLocaleString();
  const entry = `[${timestamp}] ${activity}`;
  await redis.lpush(key, entry);
  await redis.ltrim(key, 0, 9); // Keep only last 10
}

async function getActivity(redis, userId, limit = 10) {
  const key = `profile:${userId}:activityFeed`;
  return await redis.lrange(key, 0, limit - 1);
}

module.exports = { addActivity, getActivity };

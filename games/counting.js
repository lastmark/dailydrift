// games/counting.js – Add at the top
const { grantAchievement } = require("../utils/achievements.js");
const { addActivity } = require("../utils/activity.js");

// Inside the successful count section (after `await message.react("✅")`), add:

// ---- ACHIEVEMENTS & ACTIVITY ----
const userId = message.author.id;
await grantAchievement(redis, userId, 'first_count');

// Check level achievements
const profile = await redis.hgetall(`profile:${userId}`);
const level = Number(profile.level || 1);
if (level >= 10) await grantAchievement(redis, userId, 'level_10');
if (level >= 25) await grantAchievement(redis, userId, 'level_25');
if (level >= 50) await grantAchievement(redis, userId, 'level_50');
if (level >= 100) await grantAchievement(redis, userId, 'level_100');

// Check coin achievements
const balance = Number(await redis.get(`eco:${userId}:money`) || 0);
if (balance >= 10000) await grantAchievement(redis, userId, 'rich');
if (balance >= 1000000) await grantAchievement(redis, userId, 'millionaire');

await addActivity(redis, userId, `Counted to ${expectedNumber}`);

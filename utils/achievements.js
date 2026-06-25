// utils/achievements.js – Achievement definitions and helpers
const ACHIEVEMENTS = {
  first_count: { id: 'first_count', name: 'First Count', desc: 'Made your first correct count', icon: '🎯' },
  level_10: { id: 'level_10', name: 'Level 10', desc: 'Reached level 10', icon: '⭐' },
  level_25: { id: 'level_25', name: 'Level 25', desc: 'Reached level 25', icon: '🌟' },
  level_50: { id: 'level_50', name: 'Level 50', desc: 'Reached level 50', icon: '💎' },
  level_100: { id: 'level_100', name: 'Level 100', desc: 'Reached level 100', icon: '👑' },
  daily_streak_7: { id: 'daily_streak_7', name: 'Daily Streak 7', desc: 'Claimed daily bonus 7 days in a row', icon: '📅' },
  daily_streak_30: { id: 'daily_streak_30', name: 'Daily Streak 30', desc: 'Claimed daily bonus 30 days in a row', icon: '🏆' },
  games_10: { id: 'games_10', name: 'Game Master', desc: 'Played 10 games', icon: '🎮' },
  games_50: { id: 'games_50', name: 'Game Legend', desc: 'Played 50 games', icon: '🎯' },
  blackjack_win: { id: 'blackjack_win', name: 'Blackjack Winner', desc: 'Won a Blackjack game', icon: '🃏' },
  slots_win: { id: 'slots_win', name: 'Lucky Spinner', desc: 'Won a Slots game', icon: '🎰' },
  coinflip_win: { id: 'coinflip_win', name: 'Coin Flipper', desc: 'Won a Coinflip', icon: '🪙' },
  dice_win: { id: 'dice_win', name: 'Dice Master', desc: 'Won a Dice game', icon: '🎲' },
  rps_win: { id: 'rps_win', name: 'RPS Champion', desc: 'Won a Rock Paper Scissors game', icon: '✊' },
  rich: { id: 'rich', name: 'Rich', desc: 'Accumulated 10,000 coins', icon: '💰' },
  millionaire: { id: 'millionaire', name: 'Millionaire', desc: 'Accumulated 1,000,000 coins', icon: '💎' },
  friend: { id: 'friend', name: 'Social', desc: 'Added a friend', icon: '🤝' },
  married: { id: 'married', name: 'Married', desc: 'Got married', icon: '💍' },
};

function getAchievement(id) {
  return ACHIEVEMENTS[id];
}

async function grantAchievement(redis, userId, achievementId) {
  const key = `profile:${userId}:achievements`;
  const exists = await redis.sismember(key, achievementId);
  if (!exists) {
    await redis.sadd(key, achievementId);
    return true;
  }
  return false;
}

async function getAchievements(redis, userId) {
  return await redis.smembers(`profile:${userId}:achievements`);
}

async function getAchievementCount(redis, userId) {
  const ach = await getAchievements(redis, userId);
  return ach.length;
}

module.exports = {
  ACHIEVEMENTS,
  getAchievement,
  grantAchievement,
  getAchievements,
  getAchievementCount
};

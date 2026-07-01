// utils/achievements.js – Achievement System (MongoDB Optimized)
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

/**
 * Grants an achievement if the user does not already possess it.
 * Uses MongoDB $addToSet to ensure atomicity.
 */
async function grantAchievement(db, userId, achievementId) {
  // Using MongoDB's update operator to add if missing
  const result = await db.client.db().collection("profiles").updateOne(
    { userId },
    { $addToSet: { achievements: achievementId } },
    { upsert: true }
  );
  
  // modifiedCount > 0 means the set was updated (item didn't exist)
  return result.modifiedCount > 0;
}

/**
 * Retrieves an array of all achievement IDs owned by the user.
 */
async function getAchievements(db, userId) {
  const profile = await db.client.db().collection("profiles").findOne({ userId }, { projection: { achievements: 1 } });
  return profile?.achievements || [];
}

/**
 * Retrieves the total count of achievements owned by the user.
 */
async function getAchievementCount(db, userId) {
  const ach = await getAchievements(db, userId);
  return ach.length;
}

module.exports = {
  ACHIEVEMENTS,
  getAchievement,
  grantAchievement,
  getAchievements,
  getAchievementCount
};

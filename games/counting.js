// games/counting.js – ESM version with achievements & activity
import { EmbedBuilder } from 'discord.js';
import { grantAchievement } from '../utils/achievements.js';
import { addActivity } from '../utils/activity.js';

export default async function counting(message, redis) {
  const userId = message.author.id;
  const guildId = message.guild.id;

  // ---- Parse the expected number ----
  const nextKey = `counting:${guildId}:next`;
  const expected = Number(await redis.get(nextKey)) || 1;
  const rawContent = message.content.trim();
  let userNumber;

  try {
    // Allow expressions like "3+2" → evaluate safely (only digits, + - * / ^ ( ) )
    const sanitized = rawContent.replace(/\^/g, '**'); // convert ^ to ** for eval
    if (!/^[0-9+\-*/() ]+$/.test(rawContent)) {
      userNumber = NaN;
    } else {
      userNumber = eval(sanitized); // Note: eval is safe here because of the regex
    }
  } catch {
    userNumber = NaN;
  }

  if (isNaN(userNumber) || userNumber !== expected) {
    // ---- WRONG COUNT ----
    // Delete message if possible
    if (message.deletable) await message.delete().catch(() => {});

    // Check for shield
    const shields = Number(await redis.get(`eco:${userId}:shield`) || 0);
    if (shields > 0) {
      // Use shield – protect streak
      await redis.set(`eco:${userId}:shield`, shields - 1);
      const msg = await message.channel.send(
        `🛡️ **${message.author.username}** lost their streak, but a shield protected them! Remaining shields: **${shields - 1}**`
      );
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return;
    }

    // Reset streak, increment mistakes
    await redis.del(`counting:${guildId}:${userId}:streak`);
    await redis.zincrby(`counting:${guildId}:mistakes`, 1, userId);
    await redis.set(nextKey, 1); // Reset count
    await redis.del(`counting:${guildId}:last`);

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('❌ Wrong Number!')
      .setDescription(`The count has been reset to **1**. ${message.author.username} messed up.`)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ---- CORRECT COUNT ----
  // Increment count
  await redis.set(nextKey, expected + 1);
  await redis.set(`counting:${guildId}:last`, userId);

  // Streak handling
  const streakKey = `counting:${guildId}:${userId}:streak`;
  const bestKey = `counting:${guildId}:${userId}:bestStreak`;
  let streak = Number(await redis.get(streakKey) || 0);
  streak++;
  await redis.set(streakKey, streak);
  let best = Number(await redis.get(bestKey) || 0);
  if (streak > best) {
    best = streak;
    await redis.set(bestKey, best);
  }

  // Correct counts sorted set
  await redis.zincrby(`counting:${guildId}:correct`, 1, userId);

  // ---- Rewards (coins) ----
  let coinsEarned = 1 + Math.floor(expected / 10); // base coins
  // Double XP if active
  const doubleActive = Number(await redis.get(`eco:${userId}:double`) || 0);
  if (doubleActive > 0) {
    coinsEarned *= 2;
    await redis.set(`eco:${userId}:double`, doubleActive - 1);
  }
  // Premium double?
  const isPremium = await redis.get(`premium:user:${userId}`);
  if (isPremium) coinsEarned = Math.floor(coinsEarned * 1.5);

  // Add coins
  const balance = Number(await redis.get(`eco:${userId}:money`) || 0);
  await redis.set(`eco:${userId}:money`, balance + coinsEarned);

  // React with checkmark
  await message.react('✅').catch(() => {});

  // ---- ACHIEVEMENTS & ACTIVITY (your requested block) ----
  await grantAchievement(redis, userId, 'first_count');

  const profile = await redis.hgetall(`profile:${userId}`);
  const level = Number(profile.level || 1);
  if (level >= 10) await grantAchievement(redis, userId, 'level_10');
  if (level >= 25) await grantAchievement(redis, userId, 'level_25');
  if (level >= 50) await grantAchievement(redis, userId, 'level_50');
  if (level >= 100) await grantAchievement(redis, userId, 'level_100');

  const bal = Number(await redis.get(`eco:${userId}:money`) || 0);
  if (bal >= 10000) await grantAchievement(redis, userId, 'rich');
  if (bal >= 1000000) await grantAchievement(redis, userId, 'millionaire');

  await addActivity(redis, userId, `Counted to ${expected}`);

  // ---- Post streak message on milestones ----
  if (streak === 10 || streak === 25 || streak === 50 || streak === 100 || streak === 250) {
    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('🔥 Streak Milestone!')
      .setDescription(`${message.author.username} reached a **${streak}** count streak!`)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
  }
}

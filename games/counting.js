// games/counting.js – ESM, coinless, with premium perks
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

  // ---- Prevent same user from counting twice in a row ----
  const lastCounter = await redis.get(`counting:${guildId}:last`);
  if (lastCounter === userId) {
    if (message.deletable) await message.delete().catch(() => {});
    const warnMsg = await message.channel.send(`⚠️ ${message.author.username}, you can't count twice in a row!`).catch(() => {});
    if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 3000);
    return;
  }

  let userNumber;
  try {
    const sanitized = rawContent.replace(/\^/g, '**');
    if (!/^[0-9+\-*/() ]+$/.test(sanitized)) {
      userNumber = NaN;
    } else {
      userNumber = eval(sanitized);
    }
  } catch {
    userNumber = NaN;
  }

  if (isNaN(userNumber) || userNumber !== expected) {
    // ---- WRONG COUNT ----
    if (message.deletable) await message.delete().catch(() => {});

    // Shield check
    const shields = Number(await redis.get(`eco:${userId}:shield`) || 0);
    if (shields > 0) {
      await redis.set(`eco:${userId}:shield`, shields - 1);
      const msg = await message.channel.send(`🛡️ **${message.author.username}** lost their streak, but a shield protected them! Remaining shields: **${shields - 1}**`);
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return;
    }

    // ---- Premium Streak Freeze (once per day) ----
    const isPremium = await redis.get(`premium:user:${userId}`);
    if (isPremium) {
      const freezeKey = `counting:freeze:${userId}`;
      const lastFreeze = await redis.get(freezeKey);
      if (!lastFreeze || (Date.now() - Number(lastFreeze) > 24 * 60 * 60 * 1000)) {
        // Activate freeze
        await redis.set(freezeKey, Date.now());
        const msg = await message.channel.send(`❄️ **${message.author.username}**'s premium streak freeze saved their streak!`);
        setTimeout(() => msg.delete().catch(() => {}), 5000);
        return; // Don't reset streak
      }
    }

    // Reset streak, increment mistakes
    await redis.del(`counting:${guildId}:${userId}:streak`);
    await redis.zincrby(`counting:${guildId}:mistakes`, 1, userId);
    await redis.set(nextKey, 1);
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

  await redis.zincrby(`counting:${guildId}:correct`, 1, userId);

  // ---- Premium Shield Regeneration (1 shield per 24h, awarded on correct count) ----
  const isPremium = await redis.get(`premium:user:${userId}`);
  if (isPremium) {
    const shieldRegenKey = `eco:${userId}:lastShieldRegen`;
    const lastRegen = await redis.get(shieldRegenKey);
    if (!lastRegen || (Date.now() - Number(lastRegen) > 24 * 60 * 60 * 1000)) {
      await redis.set(shieldRegenKey, Date.now());
      await redis.incr(`eco:${userId}:shield`);
      // Notify user? Optional.
    }
  }

  // No coins rewarded – removed entirely.

  await message.react('✅').catch(() => {});

  // ---- Achievements & Activity ----
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

  // Streak milestones
  if (streak === 10 || streak === 25 || streak === 50 || streak === 100 || streak === 250) {
    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('🔥 Streak Milestone!')
      .setDescription(`${message.author.username} reached a **${streak}** count streak!`)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
  }
}

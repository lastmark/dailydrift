// games/counting.js – ESM, coinless, with premium perks
import { EmbedBuilder } from 'discord.js';
import { grantAchievement } from '../utils/achievements.js';
import { addActivity } from '../utils/activity.js';

export default async function counting(message, db) {
  const userId = message.author.id;
  const guildId = message.guild.id;

  // ---- Parse the expected number ----
  const nextKey = `counting:${guildId}:next`;
  const expected = Number(await db.get(nextKey)) || 1;
  const rawContent = message.content.trim();

  // ---- Prevent same user from counting twice in a row ----
  const lastCounter = await db.get(`counting:${guildId}:last`);
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
    const shields = Number(await db.get(`eco:${userId}:shield`) || 0);
    if (shields > 0) {
      await db.set(`eco:${userId}:shield`, shields - 1);
      const msg = await message.channel.send(`🛡️ **${message.author.username}** lost their streak, but a shield protected them! Remaining shields: **${shields - 1}**`);
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return;
    }

    // ---- Premium Streak Freeze (once per day) ----
    const isPremium = await db.get(`premium:user:${userId}`);
    if (isPremium) {
      const freezeKey = `counting:freeze:${userId}`;
      const lastFreeze = await db.get(freezeKey);
      if (!lastFreeze || (Date.now() - Number(lastFreeze) > 24 * 60 * 60 * 1000)) {
        // Activate freeze
        await db.set(freezeKey, Date.now());
        const msg = await message.channel.send(`❄️ **${message.author.username}**'s premium streak freeze saved their streak!`);
        setTimeout(() => msg.delete().catch(() => {}), 5000);
        return; // Don't reset streak
      }
    }

    // Reset streak, increment mistakes
    await db.del(`counting:${guildId}:${userId}:streak`);
    
    // Simulating zincrby with our MongoDB db instance
    const mistakesKey = `counting:${guildId}:mistakes`;
    let mistakesObj = (await db.get(mistakesKey)) || {};
    mistakesObj[userId] = (mistakesObj[userId] || 0) + 1;
    await db.set(mistakesKey, mistakesObj);

    await db.set(nextKey, 1);
    await db.del(`counting:${guildId}:last`);

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('❌ Wrong Number!')
      .setDescription(`The count has been reset to **1**. ${message.author.username} messed up.`)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ---- CORRECT COUNT ----
  await db.set(nextKey, expected + 1);
  await db.set(`counting:${guildId}:last`, userId);

  // Streak handling
  const streakKey = `counting:${guildId}:${userId}:streak`;
  const bestKey = `counting:${guildId}:${userId}:bestStreak`;
  let streak = Number(await db.get(streakKey) || 0);
  streak++;
  await db.set(streakKey, streak);
  let best = Number(await db.get(bestKey) || 0);
  if (streak > best) {
    best = streak;
    await db.set(bestKey, best);
  }

  // Simulating zincrby for correct counts
  const correctKey = `counting:${guildId}:correct`;
  let correctObj = (await db.get(correctKey)) || {};
  correctObj[userId] = (correctObj[userId] || 0) + 1;
  await db.set(correctKey, correctObj);

  // ---- Premium Shield Regeneration (1 shield per 24h, awarded on correct count) ----
  const isPremium = await db.get(`premium:user:${userId}`);
  if (isPremium) {
    const shieldRegenKey = `eco:${userId}:lastShieldRegen`;
    const lastRegen = await db.get(shieldRegenKey);
    if (!lastRegen || (Date.now() - Number(lastRegen) > 24 * 60 * 60 * 1000)) {
      await db.set(shieldRegenKey, Date.now());
      await db.incr(`eco:${userId}:shield`);
    }
  }

  await message.react('✅').catch(() => {});

  // ---- Achievements & Activity ----
  await grantAchievement(db, userId, 'first_count');

  const profile = await db.hgetall(`profile:${userId}`);
  const level = Number(profile.level || 1);
  if (level >= 10) await grantAchievement(db, userId, 'level_10');
  if (level >= 25) await grantAchievement(db, userId, 'level_25');
  if (level >= 50) await grantAchievement(db, userId, 'level_50');
  if (level >= 100) await grantAchievement(db, userId, 'level_100');

  const bal = Number(await db.get(`eco:${userId}:money`) || 0);
  if (bal >= 10000) await grantAchievement(db, userId, 'rich');
  if (bal >= 1000000) await grantAchievement(db, userId, 'millionaire');

  await addActivity(db, userId, `Counted to ${expected}`);

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

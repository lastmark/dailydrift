// games/counting.js – WITH SHIELD & DOUBLE XP
const { EmbedBuilder } = require("discord.js");

module.exports = async (message, redis) => {
  try {
    if (message.author.bot) return;
    
    const guildId = message.guild.id;
    const userId = message.author.id;
    const channelId = message.channel.id;

    // Check if this is the counting channel
    const countingChannel = await redis.get(`counting:${guildId}:channel`);
    if (countingChannel !== channelId) return;

    // Get current number
    const currentNumber = Number(await redis.get(`counting:${guildId}:number`) || 0);
    const expectedNumber = currentNumber + 1;

    // Parse user's message
    let userNumber;
    const cleanContent = message.content.replace(/\s+/g, "");
    
    if (/[\+\-\*\/\^]/.test(cleanContent)) {
      try {
        const mathExpression = cleanContent.replace(/\^/g, "**");
        userNumber = Function(`"use strict"; return (${mathExpression})`)();
      } catch (err) {
        userNumber = null;
      }
    } else {
      userNumber = parseInt(cleanContent);
    }

    if (isNaN(userNumber)) {
      await message.react("❌");
      return;
    }

    const lastUser = await redis.get(`counting:${guildId}:lastUser`);

    // Check double count
    if (userId === lastUser) {
      await message.react("❌");
      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription(`⚠️ <@${userId}> you can't count twice in a row!`);
      await message.reply({ embeds: [embed] });
      return;
    }

    // ---- WRONG NUMBER ----
    if (userNumber !== expectedNumber) {
      await message.react("❌");

      // 🔥 Check for SHIELD
      const shieldCount = Number(await redis.get(`eco:${userId}:shield`) || 0);
      if (shieldCount > 0) {
        // Use one shield, save the streak
        await redis.decrby(`eco:${userId}:shield`, 1);
        // Keep the number as is (don't reset)
        // But we need to reset lastUser so someone else can count
        await redis.del(`counting:${guildId}:lastUser`);

        const embed = new EmbedBuilder()
          .setColor("#3498DB")
          .setTitle("🛡️ Shield Activated!")
          .setDescription(`<@${userId}> made a mistake, but their **shield** absorbed it!`)
          .addFields(
            { name: "Remaining Shields", value: `${shieldCount - 1}`, inline: true },
            { name: "Next Number", value: `${expectedNumber}`, inline: true }
          )
          .setTimestamp();
        await message.reply({ embeds: [embed] });
        return;
      }

      // No shield – full reset
      await redis.zincrby(`counting:${guildId}:mistakes`, 1, userId);
      await redis.del(`counting:${guildId}:${userId}:streak`);
      await redis.set(`counting:${guildId}:number`, 0);
      await redis.del(`counting:${guildId}:lastUser`);

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("💥 Wrong Number!")
        .setDescription(`<@${userId}> typed **${userNumber}** but expected **${expectedNumber}**`)
        .addFields(
          { name: "🔥 Streak Lost", value: `Count reset to **0**`, inline: true }
        )
        .setTimestamp();
      await message.reply({ embeds: [embed] });
      return;
    }

    // ---- CORRECT COUNT ----
    await redis.set(`counting:${guildId}:number`, expectedNumber);
    await redis.set(`counting:${guildId}:lastUser`, userId);
    await redis.zincrby(`counting:${guildId}:correct`, 1, userId);

    // Update streak
    const currentStreak = Number(await redis.get(`counting:${guildId}:${userId}:streak`) || 0) + 1;
    await redis.set(`counting:${guildId}:${userId}:streak`, currentStreak);

    const bestStreak = Number(await redis.get(`counting:${guildId}:${userId}:bestStreak`) || 0);
    if (currentStreak > bestStreak) {
      await redis.set(`counting:${guildId}:${userId}:bestStreak`, currentStreak);
    }

    // 💰 COINS REWARD
    let baseReward = 5;
    let multiplier = 1;

    // Check for Double XP
    const doubleXP = Number(await redis.get(`eco:${userId}:double`) || 0);
    if (doubleXP > 0) {
      multiplier = 2;
      await redis.set(`eco:${userId}:double`, doubleXP - 1);
      if (doubleXP === 1) {
        await message.channel.send(`⚡ <@${userId}> used their last **Double XP**!`);
      }
    }

    // Streak bonus (every 10)
    if (currentStreak % 10 === 0) {
      multiplier += 0.5;
    }

    const totalReward = Math.floor(baseReward * multiplier);
    await redis.incrby(`eco:${userId}:money`, totalReward);

    await message.react("✅");

    // Milestones
    if (expectedNumber % 10 === 0) {
      const embed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle("🎉 Milestone Reached!")
        .setDescription(`The count reached **${expectedNumber}**!`)
        .addFields(
          { name: "👑 Counted By", value: `<@${userId}>`, inline: true },
          { name: "🔥 Streak", value: `${currentStreak}`, inline: true },
          { name: "💰 Coins Earned", value: `+${totalReward}`, inline: true }
        )
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
    }

    // Streak achievements (bonus coins)
    if (currentStreak === 10) {
      await message.channel.send(`🌟 <@${userId}> hit **10** streak! +25 bonus coins!`);
      await redis.incrby(`eco:${userId}:money`, 25);
    } else if (currentStreak === 25) {
      await message.channel.send(`💎 <@${userId}> hit **25** streak! +50 bonus coins!`);
      await redis.incrby(`eco:${userId}:money`, 50);
    } else if (currentStreak === 50) {
      await message.channel.send(`👑 <@${userId}> hit **50** streak! +100 bonus coins!`);
      await redis.incrby(`eco:${userId}:money`, 100);
    } else if (currentStreak === 100) {
      await message.channel.send(`🏆 <@${userId}> hit **100** streak! +500 bonus coins! LEGEND!`);
      await redis.incrby(`eco:${userId}:money`, 500);
    }

  } catch (error) {
    console.error("Counting game error:", error);
  }
};

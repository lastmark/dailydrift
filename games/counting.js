// games/counting.js – NO COIN REWARDS
const { EmbedBuilder } = require("discord.js");

// Local cache to prevent duplicate processing
const processedCountingMessages = new Set();

module.exports = async (message, redis) => {
  try {
    if (message.author.bot) return;

    if (processedCountingMessages.has(message.id)) return;
    processedCountingMessages.add(message.id);
    setTimeout(() => processedCountingMessages.delete(message.id), 5000);

    const guildId = message.guild.id;
    const userId = message.author.id;
    const channelId = message.channel.id;

    const countingChannel = await redis.get(`counting:${guildId}:channel`);
    if (countingChannel !== channelId) return;

    const currentNumber = Number(await redis.get(`counting:${guildId}:number`) || 0);
    const expectedNumber = currentNumber + 1;

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

    // Double count check
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

      // Check for shield (still works – uses shield but no coin loss)
      const shieldCount = Number(await redis.get(`eco:${userId}:shield`) || 0);
      if (shieldCount > 0) {
        await redis.decrby(`eco:${userId}:shield`, 1);
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

      // No shield – full reset (no coin penalty)
      await redis.zincrby(`counting:${guildId}:mistakes`, 1, userId);
      await redis.del(`counting:${guildId}:${userId}:streak`);
      await redis.set(`counting:${guildId}:number`, 0);
      await redis.del(`counting:${guildId}:lastUser`);

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("💥 Wrong Number!")
        .setDescription(`<@${userId}> typed **${userNumber}** but expected **${expectedNumber}**`)
        .addFields({ name: "🔥 Streak Lost", value: `Count reset to **0**`, inline: true })
        .setTimestamp();
      await message.reply({ embeds: [embed] });
      return;
    }

    // ---- CORRECT COUNT (no coin rewards) ----
    await redis.set(`counting:${guildId}:number`, expectedNumber);
    await redis.set(`counting:${guildId}:lastUser`, userId);
    await redis.zincrby(`counting:${guildId}:correct`, 1, userId);

    const currentStreak = Number(await redis.get(`counting:${guildId}:${userId}:streak`) || 0) + 1;
    await redis.set(`counting:${guildId}:${userId}:streak`, currentStreak);

    const bestStreak = Number(await redis.get(`counting:${guildId}:${userId}:bestStreak`) || 0);
    if (currentStreak > bestStreak) {
      await redis.set(`counting:${guildId}:${userId}:bestStreak`, currentStreak);
    }

    // React with ✅
    await message.react("✅");

    // ---- MILESTONES (no coin bonuses) ----
    if (expectedNumber % 10 === 0) {
      const embed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle("🎉 Milestone Reached!")
        .setDescription(`The count reached **${expectedNumber}**!`)
        .addFields(
          { name: "👑 Counted By", value: `<@${userId}>`, inline: true },
          { name: "🔥 Streak", value: `${currentStreak}`, inline: true }
        )
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
    }

    // ---- STREAK ACHIEVEMENTS (no coin bonuses) ----
    if (currentStreak === 100) {
      await message.channel.send(`🌟 <@${userId}> hit a **100** streak! Keep going!`);
    } else if (currentStreak === 200) {
      await message.channel.send(`💎 <@${userId}> hit a **200** streak! Amazing!`);
    } else if (currentStreak === 350) {
      await message.channel.send(`👑 <@${userId}> hit a **350** streak! LEGENDARY!`);
    } else if (currentStreak === 500) {
      await message.channel.send(`🏆 <@${userId}> hit a **500** streak! ABSOLUTE LEGEND!`);
    }

  } catch (error) {
    console.error("Counting game error:", error);
  }
};

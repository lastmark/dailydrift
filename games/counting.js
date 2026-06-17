const { EmbedBuilder } = require("discord.js");
const e = require("../emojis");

module.exports = async (message, redis) => {
  const guildId = message.guild.id;
  const userId = message.author.id;
  
  // =========================
  // GET GAME STATE
  // =========================
  const key = `count:${guildId}`;
  const lastUser = await redis.get(`${key}:user`);
  const lastNumber = parseInt(await redis.get(key) || "0");
  const expected = lastNumber + 1;

  // =========================
  // MATH EXPRESSION EVALUATION
  // =========================
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

  // =========================
  // HANDLE FAILURE (with Shield Check)
  // =========================
  const handleReset = async (errorText, expectedNum) => {
    const userShields = parseInt(await redis.get(`eco:${guildId}:${userId}:shield`) || "0");
    const streak = await redis.get(`counting:${guildId}:${userId}:streak`) || "0";

    // Check for shield
    if (userShields > 0) {
      await redis.set(`eco:${guildId}:${userId}:shield`, userShields - 1);
      
      // Save streak before reset
      const currentStreak = await redis.get(`counting:${guildId}:${userId}:streak`) || "0";
      if (Number(currentStreak) > Number(await redis.get(`counting:${guildId}:${userId}:highscore`) || "0")) {
        await redis.set(`counting:${guildId}:${userId}:highscore`, currentStreak);
      }
      
      // Reset position but keep streak
      await redis.set(key, 0);
      await redis.del(`${key}:user`);
      
      const shieldEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("🛡️ Shield Activated!")
        .setDescription(`<@${userId}> broke the count at **${lastNumber}**, but their **Counting Shield** protected them!`)
        .addFields(
          { name: "🛡️ Remaining Shields", value: `\`${userShields - 1}\``, inline: true },
          { name: "🔢 Next Number", value: `\`${expectedNum || 1}\``, inline: true },
          { name: "🔥 Streak Saved", value: `\`${currentStreak}\``, inline: true }
        )
        .setFooter({ text: "Keep going! You're protected!" })
        .setTimestamp();
      
      return message.channel.send({ embeds: [shieldEmbed] });
    }

    // =========================
    // NO SHIELD - FULL RESET
    // =========================
    try {
      const errorEmojiId = e.error.match(/\d+/)[0];
      await message.react(errorEmojiId);
    } catch (err) {
      await message.react("❌"); 
    }
    
    // Track mistake
    await redis.zincrby(`counting:${guildId}:sabotages`, 1, userId);
    
    // Save high score before reset
    const highScore = await redis.get(`counting:${guildId}:${userId}:highscore`) || "0";
    const currentStreak = await redis.get(`counting:${guildId}:${userId}:streak`) || "0";
    
    if (Number(currentStreak) > Number(highScore)) {
      await redis.set(`counting:${guildId}:${userId}:highscore`, currentStreak);
    }

    // Reset server count
    await redis.set(key, 0);
    await redis.del(`${key}:user`);

    // =========================
    // FAILURE EMBED
    // =========================
    const failEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle(`${e.error || "🚨"} Game Over! Streak Broken`)
      .setDescription(errorText)
      .addFields(
        { 
          name: "📊 Match Statistics", 
          value: [
            `💢 Final Streak: \`${lastNumber}\``,
            `🔥 Your Best: \`${highScore}\``,
            `${e.coin || "🏆"} Server High: \`${await redis.get(`counting:${guildId}:highscore`) || "0"}\``,
            `❌ Total Mistakes: \`${await redis.zscore(`counting:${guildId}:sabotages`, userId) || "0"}\``
          ].join("\n"),
          inline: false
        }
      )
      .setFooter({ text: "Clearing chat in 5 seconds..." })
      .setTimestamp();

    const alertMessage = await message.channel.send({ embeds: [failEmbed] });

    // =========================
    // AUTO CLEAR CHANNEL
    // =========================
    setTimeout(async () => {
      try {
        const messages = await message.channel.messages.fetch({ limit: 100 });
        const textToDelete = messages.filter(msg => msg.id !== alertMessage.id);
        if (textToDelete.size > 0) {
          await message.channel.bulkDelete(textToDelete, true);
        }
      } catch (err) {
        console.error("Failed to clear counting channel on reset:", err);
      }
    }, 5000);
  };

  // =========================
  // GAME RULES CHECK
  // =========================
  if (userId === lastUser) {
    return handleReset(
      `⚠️ <@${userId}> tried to count twice in a row!\n└ *Wait for someone else to count before you go again.*`,
      expected
    );
  }

  if (userNumber !== expected) {
    return handleReset(
      `⚠️ <@${userId}> typed the wrong number!\n└ *Expected:* **${expected}**\n└ *Got:* **${userNumber || "invalid text"}**`,
      expected
    );
  }

  // =========================
  // ✅ SUCCESS PIPELINE
  // =========================
  
  // Update count
  await redis.set(key, expected);
  await redis.set(`${key}:user`, userId);
  
  // Update user streak
  const currentStreak = Number(await redis.get(`counting:${guildId}:${userId}:streak`) || "0") + 1;
  await redis.set(`counting:${guildId}:${userId}:streak`, currentStreak);
  
  // Update daily count
  await redis.incr(`counting:${guildId}:${userId}:daily`);

  // =========================
  // 💰 ECONOMY REWARDS
  // =========================
  const baseReward = 5;
  let bonusMultiplier = 1;
  
  // Check for double XP
  const doubleXP = Number(await redis.get(`eco:${guildId}:${userId}:double`) || "0");
  if (doubleXP > 0) {
    bonusMultiplier = 2;
    await redis.set(`eco:${guildId}:${userId}:double`, doubleXP - 1);
    
    // Notify about double XP
    if (doubleXP === 1) {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xF1C40F)
            .setDescription(`⚡ <@${userId}> used their last **Double XP**! (2x coins earned!)`)
        ]
      });
    }
  }
  
  // Streak bonus (every 10 consecutive)
  if (currentStreak % 10 === 0) {
    bonusMultiplier += 0.5;
  }
  
  const totalReward = Math.floor(baseReward * bonusMultiplier);
  await redis.incrby(`eco:${guildId}:${userId}:money`, totalReward);

  // =========================
  // REACTION
  // =========================
  try {
    const checkEmojiId = e.check.match(/\d+/)[0];
    await message.react(checkEmojiId);
  } catch (err) {
    await message.react("✅"); 
  }

  // Update leaderboard
  await redis.zincrby(`counting:${guildId}:scores`, 1, userId);

  // =========================
  // HIGH SCORE TRACKING
  // =========================
  const currentHighScore = parseInt(await redis.get(`counting:${guildId}:highscore`) || "0");
  if (expected > currentHighScore) {
    await redis.set(`counting:${guildId}:highscore`, expected);
  }

  const userHighScore = parseInt(await redis.get(`counting:${guildId}:${userId}:highscore`) || "0");
  if (currentStreak > userHighScore) {
    await redis.set(`counting:${guildId}:${userId}:highscore`, currentStreak);
    
    // Personal best notification
    if (currentStreak > 10) {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x9B59B6)
            .setDescription(`🎯 <@${userId}> set a new personal best! **${currentStreak}** streak!`)
            .setFooter({ text: "Keep going! You're amazing!" })
        ]
      });
    }
  }

  // =========================
  // 🎯 MILESTONE TRACKING
  // =========================
  if (expected === 67) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xE67E22)
          .setDescription(`🫡 *Wait... 67? You're only 2 numbers away from greatness. Stay focused, don't mess it up now...*`)
      ]
    });
  }

  if (expected % 50 === 0 && expected > 50) {
    const milestoneEmbed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle(`🎉 Server Milestone Reached!`)
      .setDescription(`Incredible team coordination! The server has reached **${expected}** without messing up!`)
      .addFields(
        { name: "🔥 Current Streak", value: `\`${expected}\``, inline: true },
        { name: "👑 Counted By", value: `<@${userId}>`, inline: true },
        { name: "🎯 Next Milestone", value: `\`${Math.ceil(expected / 50) * 50 + 50}\``, inline: true }
      )
      .setFooter({ text: "Keep the momentum going!" })
      .setTimestamp();
      
    await message.channel.send({ embeds: [milestoneEmbed] });
  }

  // =========================
  // 🏆 STREAK ACHIEVEMENTS
  // =========================
  if (currentStreak === 10) {
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle("🌟 Double Digit Streak!")
          .setDescription(`<@${userId}> hit a **${currentStreak}** streak! Keep going!`)
      ]
    });
  }

  if (currentStreak === 25) {
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle("💎 Quarter Century Streak!")
          .setDescription(`<@${userId}> is on fire with **${currentStreak}** consecutive counts!`)
      ]
    });
  }

  if (currentStreak === 50) {
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xF1C40F)
          .setTitle("👑 Half Century Streak!")
          .setDescription(`<@${userId}> is absolutely crushing it with **${currentStreak}** counts! LEGENDARY!`)
          .setFooter({ text: "50 in a row! Incredible!" })
      ]
    });
  }

  if (currentStreak === 100) {
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle("🏆 CENTURY STREAK!")
          .setDescription(`<@${userId}> has achieved the ultimate **${currentStreak}** streak! ABSOLUTE LEGEND!`)
          .setFooter({ text: "100 consecutive counts! Perfection!" })
      ]
    });
  }

  // =========================
  // 🤖 AUTO ROLE ASSIGNMENT
  // =========================
  try {
    const topCounterArray = await redis.zrevrange(`counting:${guildId}:scores`, 0, 0);
    if (topCounterArray.length > 0) {
      const topUserId = topCounterArray[0];
      const roleName = "Counting Legend";
      let role = message.guild.roles.cache.find(r => r.name === roleName);
      
      if (!role) {
        role = await message.guild.roles.create({
          name: roleName,
          color: 0xF1C40F,
          reason: "Top counter reward",
        });
      }

      // Remove from others
      const currentMembers = role.members;
      for (const [, member] of currentMembers) {
        if (member.id !== topUserId) {
          await member.roles.remove(role);
        }
      }

      // Add to new top counter
      const championMember = await message.guild.members.fetch(topUserId);
      if (!championMember.roles.cache.has(role.id)) {
        await championMember.roles.add(role);
      }
    }
  } catch (err) {
    // Fail silently
  }
};

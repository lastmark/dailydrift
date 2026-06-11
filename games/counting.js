const { EmbedBuilder } = require("discord.js");
const e = require("../emojis");

module.exports = async (message, redis) => {
  const guildId = message.guild.id;
  const userId = message.author.id;
  
  const key = `count:${guildId}`;
  const lastUser = await redis.get(`${key}:user`);
  const lastNumber = parseInt(await redis.get(key) || "0");
  const expected = lastNumber + 1;

  // 1. Math Expression Evaluation Engine
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

  // Helper Function: Handle Game Failures (Shield Checks & Channel Purges)
  const handleReset = async (errorText) => {
    const userShields = parseInt(await redis.get(`eco:${guildId}:${userId}:shield`) || "0");

    if (userShields > 0) {
      await redis.set(`eco:${guildId}:${userId}:shield`, userShields - 1);
      
      const shieldEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setDescription(`🛡️ **Streak Saved!** <@${userId}> broke the count, but their **Counting Shield** absorbed the damage!\n└ *Remaining Shields:* \`${userShields - 1}\`\n└ *Keep counting from number:* **${expected}**`);
      
      return message.channel.send({ embeds: [shieldEmbed] });
    }

    try {
      const errorEmojiId = e.error.match(/\d+/)[0];
      await message.react(errorEmojiId);
    } catch (err) {
      await message.react("❌"); 
    }
    
    await redis.zincrby(`counting:${guildId}:sabotages`, 1, userId);
    const highScore = await redis.get(`counting:${guildId}:highscore`) || "0";

    await redis.set(key, 0);
    await redis.del(`${key}:user`);

    const failEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle(`${e.error || "🚨"} Game Over! Streak Broken`)
      .setDescription(`${errorText}\n\n📊 **Match Statistics:**\n└ Final Streak: \`${lastNumber}\`\n└ ${e.coin || "🏆"} Server High Score: \`${highScore}\``)
      .setFooter({ text: "Channel clearing history in 5 seconds..." });

    const alertMessage = await message.channel.send({ embeds: [failEmbed] });

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

  // 2. Run Game Rules Check
  if (userId === lastUser) {
    return handleReset(`⚠️ <@${userId}> tried to count twice in a row!`);
  }

  if (userNumber !== expected) {
    return handleReset(`⚠️ <@${userId}> typed the wrong number! Expected **${expected}**, but got **${userNumber || "invalid text"}**.`);
  }

  // ==========================================
  // 3. SUCCESS PIPELINE HANDLING
  // ==========================================
  await redis.set(key, expected);
  await redis.set(`${key}:user`, userId);

  // 💰 ECONOMY INTEGRATION: Award 5 coins to the user's wallet profile
  await redis.incrby(`eco:${guildId}:${userId}:money`, 5);

  try {
    const checkEmojiId = e.check.match(/\d+/)[0];
    await message.react(checkEmojiId);
  } catch (err) {
    await message.react("✅"); 
  }

  await redis.zincrby(`counting:${guildId}:scores`, 1, userId);

  const currentHighScore = parseInt(await redis.get(`counting:${guildId}:highscore`) || "0");
  if (expected > currentHighScore) {
    await redis.set(`counting:${guildId}:highscore`, expected);
  }

  // 4. Milestone Tracking Updates
  if (expected === 67) {
    await message.reply(`${e.bot} *Wait... 67? You're only 2 numbers away from greatness. Stay focused, don't mess it up now...* 🫡`);
  } else if (expected % 100 === 0) {
    const milestoneEmbed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle(`🥳 Amazing Milestone Reached!`)
      .setDescription(`🎉 Incredible team coordination! The server has successfully reached **${expected}** without messing up! Let's keep moving forward!`);
    await message.channel.send({ embeds: [milestoneEmbed] });
  }

  // 5. Automated Role Reward Assignment
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
          reason: "Rank designation reward for the top server counter",
        });
      }

      if (!message.guild.members.cache.get(topUserId)?.roles.cache.has(role.id)) {
        role.members.forEach(async (member) => await member.roles.remove(role));
        const championMember = await message.guild.members.fetch(topUserId);
        await championMember.roles.add(role);
      }
    }
  } catch (err) {
    // Fail silently if role order hierarchy drops
  }
};

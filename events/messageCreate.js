// events/messageCreate.js – Main Bot (Full)
const { Events, EmbedBuilder } = require("discord.js");
const { checkBlacklist, buildBlacklistEmbed } = require("../blacklist.js");

// Message cache to prevent duplicate processing
const processedMessages = new Set();

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client, redis) {
    // ---- Basic checks ----
    if (!message.guild || message.author.bot) return;

    console.log(`[MSG] From ${message.author.tag}: ${message.content.slice(0, 50)}`);

    // ---- BLACKLIST CHECK (FIRST) ----
    const blacklist = await checkBlacklist(redis, message.author.id, message.guild.id);
    if (blacklist) {
      console.log(`[MSG] Blocked by blacklist: ${message.author.tag}`);
      if (message.content.startsWith("!")) {
        const embed = buildBlacklistEmbed(blacklist.data, blacklist.type);
        await message.reply({ embeds: [embed] });
        await message.delete().catch(() => {});
      }
      return; // block all messages from blacklisted users/guilds
    }

    // ---- MAINTENANCE CHECK ----
    const maintenanceKey = `maintenance:${message.guild.id}`;
    if (await redis.get(maintenanceKey) === "true") {
      if (message.content.startsWith("!")) {
        await message.reply("🔧 The bot is currently under maintenance. Please try again later.");
      }
      return; // block all messages during maintenance
    }

    // ---- Prevent duplicate processing ----
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 5000);

    const userId = message.author.id;
    const guildId = message.guild.id;
    const content = message.content;

    // ==========================================
    // 🔥 COUNTING GAME – if in counting channel
    // ==========================================
    try {
      const countingChannelId = await redis.get(`counting:${guildId}:channel`);
      if (countingChannelId && message.channel.id === countingChannelId) {
        const pure = content.replace(/\s+/g, "");
        const isValid = /^[0-9+\-*/^()]+$/.test(pure);
        if (!isValid) {
          if (message.deletable) await message.delete().catch(() => {});
          return;
        }
        const runCounting = require("../games/counting.js");
        await runCounting(message, redis);
        return;
      }
    } catch (err) {
      console.error("Counting game error:", err);
    }

    // ==========================================
    // 💬 PREFIX COMMANDS
    // ==========================================
    if (content.startsWith("!")) {
      const args = content.slice(1).trim().split(/ +/);
      const cmd = args.shift().toLowerCase();

      // ---- DEBUG: Check blacklist status ----
      if (cmd === "checkblacklist") {
        const target = message.mentions.users.first() || message.author;
        const blacklistStatus = await checkBlacklist(redis, target.id, message.guild.id);
        if (!blacklistStatus) {
          return message.reply(`✅ **${target.username}** is NOT blacklisted.`);
        }
        const embed = buildBlacklistEmbed(blacklistStatus.data, blacklistStatus.type);
        return message.reply({ embeds: [embed] });
      }

      // ---- PUBLIC SHOP COMMANDS ----
      if (cmd === "shop") {
        const balance = Number(await redis.get(`eco:${userId}:money`) || 0);
        const shields = Number(await redis.get(`eco:${userId}:shield`) || 0);
        const doubleXP = Number(await redis.get(`eco:${userId}:double`) || 0);
        const embed = new EmbedBuilder()
          .setColor("#FF69B4")
          .setTitle("🛒 Counting Shop")
          .setDescription(`💰 Your balance: **${balance}** coins`)
          .addFields(
            { 
              name: "🛡️ Shield", 
              value: `Protects your streak from one mistake\nPrice: **200** coins\nOwned: **${shields}**`,
              inline: true 
            },
            { 
              name: "⚡ Double XP", 
              value: `Double coins for 5 correct counts\nPrice: **500** coins\nActive: **${doubleXP > 0 ? 'Yes' : 'No'}**`,
              inline: true 
            }
          )
          .setFooter({ text: "Use !buy shield / !buy double" })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (cmd === "buy") {
        const item = args[0]?.toLowerCase();
        if (!item || !["shield", "double"].includes(item)) {
          return message.reply("❌ Usage: `!buy shield` or `!buy double`");
        }
        const prices = { shield: 200, double: 500 };
        const price = prices[item];
        const balance = Number(await redis.get(`eco:${userId}:money`) || 0);
        if (balance < price) {
          return message.reply(`❌ You need **${price}** coins. You have **${balance}**.`);
        }
        await redis.set(`eco:${userId}:money`, balance - price);
        if (item === "shield") {
          await redis.incr(`eco:${userId}:shield`);
          const newShields = await redis.get(`eco:${userId}:shield`);
          return message.reply(`✅ You bought a **Shield**! You now have **${newShields}** shields.`);
        } else if (item === "double") {
          await redis.set(`eco:${userId}:double`, 5);
          return message.reply(`✅ You bought **Double XP** for 5 counts!`);
        }
      }

      if (cmd === "shields") {
        const shields = Number(await redis.get(`eco:${userId}:shield`) || 0);
        return message.reply(`🛡️ You have **${shields}** shield${shields !== 1 ? 's' : ''}.`);
      }

      if (cmd === "countingstats") {
        const target = message.mentions.users.first() || message.author;
        const id = target.id;
        const correct = Number(await redis.zscore(`counting:${guildId}:correct`, id) || 0);
        const mistakes = Number(await redis.zscore(`counting:${guildId}:mistakes`, id) || 0);
        const streak = Number(await redis.get(`counting:${guildId}:${id}:streak`) || 0);
        const best = Number(await redis.get(`counting:${guildId}:${id}:bestStreak`) || 0);
        const coins = Number(await redis.get(`eco:${id}:money`) || 0);
        const embed = new EmbedBuilder()
          .setColor("#5865F2")
          .setAuthor({ name: `${target.username}'s Counting Stats`, iconURL: target.displayAvatarURL() })
          .addFields(
            { name: "✅ Correct", value: `${correct}`, inline: true },
            { name: "❌ Mistakes", value: `${mistakes}`, inline: true },
            { name: "🔥 Current Streak", value: `${streak}`, inline: true },
            { name: "🏆 Best Streak", value: `${best}`, inline: true },
            { name: "💰 Coins", value: `${coins}`, inline: true }
          )
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      // If command not recognized, ignore
      return;
    }

    // ==========================================
    // 💎 XP / LEVEL SYSTEM (non-command messages)
    // ==========================================
    const cooldownKey = `xp:cd:${userId}`;
    if (await redis.get(cooldownKey)) return;
    await redis.setex(cooldownKey, 60, "1");

    const isPremium = await redis.get(`premium:user:${userId}`);
    let xpGain = Math.floor(Math.random() * 11) + 15; // 15–25 XP
    if (isPremium) xpGain = Math.floor(xpGain * 1.8);

    const profileKey = `profile:${userId}`;
    let xp = Number(await redis.hget(profileKey, "xp") || 0);
    let level = Number(await redis.hget(profileKey, "level") || 1);

    xp += xpGain;
    const needed = Math.floor(100 * Math.pow(level, 1.6));

    if (xp >= needed && level < 120) {
      xp -= needed;
      level++;
      await redis.hset(profileKey, "level", level);
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle("⚡ Level Up!")
            .setDescription(`You reached **Level ${level}**`)
        ]
      }).catch(() => {});
    }
    await redis.hset(profileKey, "xp", xp);

    // ==========================================
    // 🤖 AUTO RESPONDER
    // ==========================================
    const key = content.toLowerCase().trim();
    const responder = await redis.get(`responder:${guildId}:${key}`);
    if (responder) {
      const data = JSON.parse(responder);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(data.color || "#5865F2")
            .setTitle(data.title)
            .setDescription(data.reply)
        ]
      });
    }
  }
};

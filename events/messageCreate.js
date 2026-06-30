// events/messageCreate.js – Main Bot (Full) – COUNTING REMOVED (handled in index.js)
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

    // ---- Prevent duplicate processing (within this handler only) ----
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 5000);

    const userId = message.author.id;
    const guildId = message.guild.id;
    const content = message.content;

    // ---- TERMS CHECK (prefix commands) ----
    const accepted = await redis.get(`terms:accepted:${message.author.id}`);
    const currentVersion = require("../config").TERMS_VERSION || "1.0";
    if (accepted !== currentVersion) {
      // Block all prefix commands except `!terms` or `?terms`
      if (!message.content.match(/^[!?]terms$/)) {
        return message.reply("📜 You must accept the Terms of Service first. Run `!terms` to view and accept.");
      }
      // Allow !terms to go through
    }

    // ==========================================
    // ⚠️ COUNTING GAME IS NOW HANDLED IN index.js
    // ==========================================

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

      // ---- 🚀 CREATE ANIMATED ROCKET GIF (for custom emoji) ----
      if (cmd === "createrocketspin") {
        const { createCanvas } = require("canvas");
        const GIFEncoder = require("gif-encoder-2");
        try {
          const W = 64, H = 64, DELAY = 80, CYCLES = 3;
          const encoder = new GIFEncoder(W, H, "neuquant", true);
          encoder.start(); encoder.setRepeat(0); encoder.setDelay(DELAY); encoder.setQuality(10);
          const canvas = createCanvas(W, H);
          const ctx = canvas.getContext("2d");

          // Simple rocket shape (triangle body + fins + window)
          function drawRocket(ctx, dy) {
            ctx.fillStyle = "#1a1a2e";
            ctx.fillRect(0, 0, W, H);
            // Rocket body (white triangle)
            ctx.fillStyle = "#FFFFFF";
            ctx.beginPath();
            ctx.moveTo(W/2, 10 + dy);
            ctx.lineTo(W/2 + 12, 50 + dy);
            ctx.lineTo(W/2 - 12, 50 + dy);
            ctx.closePath();
            ctx.fill();
            // Fins (red triangles)
            ctx.fillStyle = "#FF4444";
            ctx.beginPath();
            ctx.moveTo(W/2 - 12, 50 + dy);
            ctx.lineTo(W/2 - 20, 58 + dy);
            ctx.lineTo(W/2 - 8, 54 + dy);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(W/2 + 12, 50 + dy);
            ctx.lineTo(W/2 + 20, 58 + dy);
            ctx.lineTo(W/2 + 8, 54 + dy);
            ctx.closePath();
            ctx.fill();
            // Window (blue circle)
            ctx.fillStyle = "#00AAFF";
            ctx.beginPath();
            ctx.arc(W/2, 30 + dy, 4, 0, Math.PI * 2);
            ctx.fill();
          }

          const positions = [0, -2, -4, -2, 0, 2, 4, 2];
          for (let c = 0; c < CYCLES; c++) {
            for (const dy of positions) {
              drawRocket(ctx, dy);
              encoder.addFrame(ctx);
            }
          }

          encoder.finish();
          const buffer = encoder.out.getData();
          await message.author.send({
            content: "✅ Here is your animated rocket GIF. Upload it as an emoji named `rocket_fly`.",
            files: [{ attachment: buffer, name: "rocket_fly.gif" }]
          });
          await message.reply("📬 Rocket GIF sent to your DMs!");
        } catch (err) {
          console.error(err);
          await message.reply(`❌ Failed: ${err.message}`);
        }
        return;
      }

      // If command not recognized, ignore
      return;
    }


// ==========================================
    // 💤 AFK SYSTEM (auto‑clear & mention reply)
    // ==========================================

    // If the message author is AFK, remove it and notify them
    const afkDataRaw = await redis.get(`afk:${userId}`);
    if (afkDataRaw) {
      await redis.del(`afk:${userId}`);
      const afkData = JSON.parse(afkDataRaw);
      const time = Date.now() - afkData.since;
      const timeAgo = time < 60000 ? 'just now' : `<t:${Math.floor(afkData.since / 1000)}:R>`;

      const welcomeEmbed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("👋 Welcome Back!")
        .setDescription(`${message.author}, you are no longer AFK.`)
        .addFields(
          { name: "You were AFK for", value: timeAgo },
          { name: "Reason was", value: afkData.reason }
        );
      // Send a subtle reply (will be deleted after a few seconds)
      const afkReply = await message.channel.send({ embeds: [welcomeEmbed] });
      setTimeout(() => afkReply.delete().catch(() => {}), 5000);
    }

    // Check if any mentioned user is AFK
    const mentionedUsers = message.mentions.users.filter(u => u.id !== userId);
    for (const [id, user] of mentionedUsers) {
      const afkCheck = await redis.get(`afk:${id}`);
      if (afkCheck) {
        const afkData = JSON.parse(afkCheck);
        const embed = new EmbedBuilder()
          .setColor("#5865F2")
          .setDescription(`💤 **${user.username}** is currently AFK since <t:${Math.floor(afkData.since / 1000)}:R>\n**Reason:** ${afkData.reason}`);
        await message.reply({ embeds: [embed] }).catch(() => {});
      }
    }

    
    // ==========================================
    // 💎 XP / LEVEL SYSTEM (non-command messages)
    // ==========================================
    const cooldownKey = `xp:cd:${userId}`;
    const isUserPremium = await redis.get(`premium:user:${userId}`);
    const cooldownSeconds = isUserPremium ? 30 : 60;
    if (await redis.get(cooldownKey)) return;
    await redis.setex(cooldownKey, cooldownSeconds, "1");

    let xpGain = Math.floor(Math.random() * 11) + 15; // 15–25 XP
    if (isUserPremium) xpGain = Math.floor(xpGain * 2); // permanent 2x XP for user premium

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

const { Events, EmbedBuilder } = require("discord.js");

const DEV_ID = "1303357369622990889"; // 👑 Your ID

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client, redis) {
    if (!message.guild || message.author.bot) return;

    const userId = message.author.id;
    const guildId = message.guild.id;
    const content = message.content;

    // ==========================================
    // 🔥 COUNTING GAME – if in counting channel
    // ==========================================
    try {
      const countingChannelId = await redis.get(`counting:${guildId}:channel`);
      if (countingChannelId && message.channel.id === countingChannelId) {
        // Only allow numbers/math expressions
        const pure = content.replace(/\s+/g, "");
        const isValid = /^[0-9+\-*/^()]+$/.test(pure);
        if (!isValid) {
          if (message.deletable) await message.delete().catch(() => {});
          return;
        }
        // Run the counting game logic
        const runCounting = require("../games/counting.js");
        await runCounting(message, redis);
        return; // counting messages should NOT trigger XP or responder
      }
    } catch (err) {
      console.error("Counting game error:", err);
    }

    // ==========================================
    // 💎 XP / LEVEL SYSTEM (global profile)
    // ==========================================
    const cooldownKey = `xp:cd:${userId}`; // global cooldown (per user)
    if (await redis.get(cooldownKey)) return;
    await redis.setex(cooldownKey, 60, "1");

    const isPremium = await redis.get(`premium:user:${userId}`);

    let xpGain = Math.floor(Math.random() * 11) + 15; // 15–25
    let coinGain = Math.floor(Math.random() * 10) + 10; // 10–20

    if (isPremium) {
      xpGain = Math.floor(xpGain * 1.8);
      coinGain = Math.floor(coinGain * 1.8);
    }

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
    // 💰 GLOBAL ECONOMY (coins)
    // ==========================================
    await redis.incrby(`eco:${userId}:money`, coinGain);

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

    // ==========================================
    // 👑 DEV ADMIN COMMANDS (message-based)
    // ==========================================
    if (userId !== DEV_ID) return; // only you

    if (!content.startsWith("!")) return;
    const args = content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // -------- COINS --------
    if (cmd === "addcoins") {
      const target = message.mentions.users.first();
      const amount = parseInt(args[1]);
      if (!target || isNaN(amount) || amount < 1)
        return message.reply("❌ Usage: `!addcoins @user amount`");
      await redis.incrby(`eco:${target.id}:money`, amount);
      const bal = await redis.get(`eco:${target.id}:money`) || 0;
      return message.reply(`✅ Added **${amount}** coins to **${target.username}**. New balance: **${bal}**`);
    }

    if (cmd === "removecoins") {
      const target = message.mentions.users.first();
      const amount = parseInt(args[1]);
      if (!target || isNaN(amount) || amount < 1)
        return message.reply("❌ Usage: `!removecoins @user amount`");
      const current = Number(await redis.get(`eco:${target.id}:money`) || 0);
      if (current < amount) return message.reply(`❌ ${target.username} only has ${current} coins.`);
      await redis.decrby(`eco:${target.id}:money`, amount);
      const bal = await redis.get(`eco:${target.id}:money`) || 0;
      return message.reply(`✅ Removed **${amount}** coins. New balance: **${bal}**`);
    }

    if (cmd === "setbalance") {
      const target = message.mentions.users.first();
      const amount = parseInt(args[1]);
      if (!target || isNaN(amount) || amount < 0)
        return message.reply("❌ Usage: `!setbalance @user amount`");
      await redis.set(`eco:${target.id}:money`, amount);
      return message.reply(`✅ Set **${target.username}**'s balance to **${amount}** coins`);
    }

    // -------- SHIELDS --------
    if (cmd === "addshields") {
      const target = message.mentions.users.first();
      const amount = parseInt(args[1]);
      if (!target || isNaN(amount) || amount < 1)
        return message.reply("❌ Usage: `!addshields @user amount`");
      await redis.incrby(`eco:${target.id}:shield`, amount);
      const shields = await redis.get(`eco:${target.id}:shield`) || 0;
      return message.reply(`✅ Added **${amount}** shields. Total: **${shields}**`);
    }

    if (cmd === "removeshields") {
      const target = message.mentions.users.first();
      const amount = parseInt(args[1]);
      if (!target || isNaN(amount) || amount < 1)
        return message.reply("❌ Usage: `!removeshields @user amount`");
      const current = Number(await redis.get(`eco:${target.id}:shield`) || 0);
      if (current < amount) return message.reply(`❌ ${target.username} only has ${current} shields.`);
      await redis.decrby(`eco:${target.id}:shield`, amount);
      const shields = await redis.get(`eco:${target.id}:shield`) || 0;
      return message.reply(`✅ Removed **${amount}** shields. Remaining: **${shields}**`);
    }

    // -------- PREMIUM --------
    if (cmd === "removepremium") {
      const target = message.mentions.users.first();
      if (!target) return message.reply("❌ Usage: `!removepremium @user`");
      await redis.del(`premium:user:${target.id}`);
      await redis.del(`eco:${target.id}:vip`);
      return message.reply(`✅ Removed premium from **${target.username}**`);
    }

    // -------- COUNTING SETUP (quick) --------
    if (cmd === "setcountingchannel") {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply("❌ Usage: `!setcountingchannel #channel`");
      await redis.set(`counting:${guildId}:channel`, channel.id);
      await redis.set(`counting:${guildId}:number`, 0);
      return message.reply(`✅ Counting channel set to ${channel}`);
    }

    if (cmd === "resetcounting") {
      const keys = await redis.keys(`counting:${guildId}:*`);
      for (const key of keys) await redis.del(key);
      await redis.set(`counting:${guildId}:number`, 0);
      return message.reply("✅ All counting stats reset.");
    }

    // -------- VIEW COUNTING STATS (for any user) --------
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

    // -------- HELP --------
    if (cmd === "helpdev") {
      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("👑 Dev Commands")
        .setDescription("All commands use `!` prefix")
        .addFields(
          { name: "💰 Economy", value: [
            "`!addcoins @user amount`",
            "`!removecoins @user amount`",
            "`!setbalance @user amount`"
          ].join("\n"), inline: false },
          { name: "🛡️ Shields", value: [
            "`!addshields @user amount`",
            "`!removeshields @user amount`"
          ].join("\n"), inline: false },
          { name: "👑 Premium", value: "`!removepremium @user`", inline: false },
          { name: "🎯 Counting", value: [
            "`!setcountingchannel #channel`",
            "`!resetcounting`",
            "`!countingstats @user`"
          ].join("\n"), inline: false }
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // Old devv command (keep if you want)
    if (cmd === "devv") {
      const sub = args[0];
      if (sub === "xp") {
        await redis.hset(`profile:${userId}`, "xp", 0);
        await redis.hset(`profile:${userId}`, "level", 3);
        return message.reply("XP reset for testing.");
      }
      if (sub === "coins") {
        await redis.set(`eco:${userId}:money`, 10000);
        return message.reply("Coins set to 10,000.");
      }
      return message.reply("Usage: !devv xp | coins");
    }
  }
};

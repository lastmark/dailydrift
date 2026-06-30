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
 

    // ==========================================
    // ⚠️ COUNTING GAME IS NOW HANDLED IN index.js
    // ==========================================

    // ==========================================
    // 💬 PREFIX COMMANDS
    // ==========================================
  

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

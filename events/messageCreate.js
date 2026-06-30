// events/messageCreate.js – Main Bot (Full) – WITH OFFICIAL PROGRESSION & ECON PAYOUTS
const { Events, EmbedBuilder } = require("discord.js");
const { checkBlacklist, buildBlacklistEmbed } = require("../blacklist.js");

// Message cache to prevent duplicate processing
const processedMessages = new Set();

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client, db) {
    // ---- Basic checks ----
    if (!message.guild || message.author.bot) return;

    console.log(`[MSG] From ${message.author.tag}: ${message.content.slice(0, 50)}`);

    // ---- BLACKLIST CHECK (FIRST) ----
    const blacklist = await checkBlacklist(db, message.author.id, message.guild.id);
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
    if (await db.get(maintenanceKey) === "true") {
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
    // 💤 AFK SYSTEM (auto‑clear & mention reply)
    // ==========================================

    // If the message author is AFK, remove it and notify them
    const afkData = await db.get(`afk:${userId}`);
    if (afkData) {
      await db.del(`afk:${userId}`);
      const time = Date.now() - afkData.since;
      const timeAgo = time < 60000 ? 'just now' : `<t:${Math.floor(afkData.since / 1000)}:R>`;

      const welcomeEmbed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("👋 Welcome Back!")
        .setDescription(`${message.author}, your AFK status has been cleared.`)
        .addFields(
          { name: "Duration", value: timeAgo, inline: true },
          { name: "Last Reason", value: afkData.reason || "No reason provided.", inline: true }
        );
      
      const afkReply = await message.channel.send({ embeds: [welcomeEmbed] });
      setTimeout(() => afkReply.delete().catch(() => {}), 5000);
    }

    // Check if any mentioned user is AFK
    const mentionedUsers = message.mentions.users.filter(u => u.id !== userId);
    for (const [id, user] of mentionedUsers) {
      const afkCheck = await db.get(`afk:${id}`);
      if (afkCheck) {
        const embed = new EmbedBuilder()
          .setColor("#111111")
          .setDescription(`💤 **${user.username}** went AFK <t:${Math.floor(afkCheck.since / 1000)}:R>\n💬 "${afkCheck.reason || "No reason provided."}"`);
        await message.reply({ embeds: [embed] }).catch(() => {});
      }
    }

    // ==========================================
    // 💎 OFFICIAL XP / LEVELING SYSTEM WITH ECONOMY REWARDS
    // ==========================================
    const cooldownKey = `xp:cd:${userId}`;
    if (!(await db.get(cooldownKey))) {
      const isUserPremium = await db.get(`premium:user:${userId}`);
      const cooldownSeconds = isUserPremium ? 30 : 60;

      await db.set(cooldownKey, "1");
      setTimeout(async () => { await db.del(cooldownKey).catch(() => {}); }, cooldownSeconds * 1000);

      // Base XP generation (Official Mee6 bracket: 15-25)
      let xpGain = Math.floor(Math.random() * 11) + 15; 
      if (isUserPremium) xpGain *= 2; // Permanent double XP booster for premium tier users

      const profileKey = `profile:${userId}`;
      const profile = (await db.hgetall(profileKey)) || {};
      let xp = Number(profile.xp || 0);
      let level = Number(profile.level || 0); 

      xp += xpGain;
      
      // Standard Official Progression Formula
      const getNeededXP = (lvl) => 5 * (lvl ** 2) + (50 * lvl) + 100;
      let needed = getNeededXP(level);

      let leveledUp = false;
      const initialLevel = level;
      let totalCoinReward = 0;

      while (xp >= needed && level < 120) {
        xp -= needed;
        level++;
        needed = getNeededXP(level);
        leveledUp = true;

        // Calculate scaling economy payout per level up step
        const levelReward = 10000 * level;
        totalCoinReward += levelReward;
      }

      if (leveledUp) {
        profile.level = level;
        
        // Update user's cash balance inside the economy schema
        const econKey = `eco:${userId}:money`;
        const currentBalance = Number(await db.get(econKey) || 0);
        await db.set(econKey, currentBalance + totalCoinReward);
        
        // Generate a visual text progress bar
        const progressBarsCount = 10;
        const currentProgress = Math.min(Math.floor((xp / needed) * progressBarsCount), progressBarsCount);
        const progressBarStr = "🟩".repeat(currentProgress) + "⬛".repeat(progressBarsCount - currentProgress);

        const lvlEmbed = new EmbedBuilder()
          .setColor("#0A0A0A") // Premium minimalist background
          .setTitle("✨ Level Advanced")
          .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setDescription(`Congratulations! Your active participation has progressed your profile account status.`)
          .addFields(
            { name: "📈 Level Up", value: `\`Level ${initialLevel}\` ➔ \`Level ${level}\``, inline: true },
            { name: "💰 Level Reward", value: `🪙 **+${totalCoinReward.toLocaleString()}** coins`, inline: true },
            { name: "✨ Earned Booster", value: isUserPremium ? "🟢 `2.0x Premium Active`" : "⚪ `1.0x Standard`", inline: true },
            { name: "📊 Next Progression Stage", value: `${progressBarStr} \`${xp} / ${needed} XP\``, inline: false }
          )
          .setTimestamp();

        message.channel.send({ embeds: [lvlEmbed] }).catch(() => {});
      }
      
      profile.xp = xp;
      await db.set(profileKey, profile);
    }

    // ==========================================
    // 🤖 AUTO RESPONDER
    // ==========================================
    const key = content.toLowerCase().trim();
    const responder = await db.get(`responder:${guildId}:${key}`);
    if (responder) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(responder.color || "#0A0A0A")
            .setTitle(responder.title)
            .setDescription(responder.reply)
        ]
      });
    }
  }
};

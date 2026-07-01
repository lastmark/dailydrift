// events/messageCreate.js – Unified handler (counting first, fast, XP fixed)
const { Events, EmbedBuilder } = require("discord.js");
const { checkBlacklist, buildBlacklistEmbed } = require("../blacklist.js");

const processedMessages = new Set();

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client, db) {
    if (!message.guild || message.author.bot) return;
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 5000);

    const userId = message.author.id;
    const guildId = message.guild.id;
    const content = message.content;

    // ==========================================
    // 🔥 COUNTING (skip all other checks)
    // ==========================================
    try {
      const countingChannelId = await db.get(`counting:${guildId}:channel`);
      if (countingChannelId && message.channel.id === countingChannelId) {
        const pureContent = content.replace(/\s+/g, "");
        if (!/^[0-9+\-*/^()]+$/.test(pureContent)) {
          if (message.deletable) await message.delete().catch(() => {});
          return;
        }
        const runCountingGame = require("../games/counting.js");
        await runCountingGame(message, db);
        return; // ✅ counting handled, exit immediately
      }
    } catch (error) {
      console.error("Counting engine error:", error);
    }

    // ==========================================
    // 🛡️ BLACKLIST CHECK (only non‑counting)
    // ==========================================
    const blacklist = await checkBlacklist(db, userId, guildId);
    if (blacklist) {
      console.log(`[MSG] Blocked by blacklist: ${message.author.tag}`);
      if (content.startsWith("!")) {
        const embed = buildBlacklistEmbed(blacklist.data, blacklist.type);
        await message.reply({ embeds: [embed] });
        await message.delete().catch(() => {});
      }
      return;
    }

    // ==========================================
    // 🔧 MAINTENANCE CHECK
    // ==========================================
    const maintenanceKey = `maintenance:${guildId}`;
    if (await db.get(maintenanceKey) === "true") {
      if (content.startsWith("!")) {
        await message.reply("🔧 The bot is currently under maintenance. Please try again later and Join our Support Server for more informations! .");
      }
      return;
    }

    // ==========================================
    // 💤 AFK SYSTEM
    // ==========================================
    const afkDataRaw = await db.get(`afk:${userId}`);
    if (afkDataRaw) {
      const afkData = typeof afkDataRaw === 'object' ? afkDataRaw : JSON.parse(afkDataRaw);
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

    const mentionedUsers = message.mentions.users.filter(u => u.id !== userId);
    for (const [id, user] of mentionedUsers) {
      const afkCheckRaw = await db.get(`afk:${id}`);
      if (afkCheckRaw) {
        const afkCheck = typeof afkCheckRaw === 'object' ? afkCheckRaw : JSON.parse(afkCheckRaw);
        const embed = new EmbedBuilder()
          .setColor("#111111")
          .setDescription(`💤 **${user.username}** went AFK <t:${Math.floor(afkCheck.since / 1000)}:R>\n💬 "${afkCheck.reason || "No reason provided."}"`);
        await message.reply({ embeds: [embed] }).catch(() => {});
      }
    }

    // ==========================================
    // 💎 XP / LEVELING SYSTEM WITH ECONOMY REWARDS
    // ==========================================
    const cooldownKey = `xp:cd:${userId}`;
    if (!(await db.get(cooldownKey))) {
      const isUserPremium = await db.get(`premium:user:${userId}`);
      const cooldownSeconds = isUserPremium ? 30 : 60;

      await db.set(cooldownKey, "1");
      setTimeout(async () => { await db.del(cooldownKey).catch(() => {}); }, cooldownSeconds * 1000);

      let xpGain = Math.floor(Math.random() * 11) + 15; 
      if (isUserPremium) xpGain *= 2;

      const profileKey = `profile:${userId}`;
      // ✅ FIX: use db.get instead of hgetall, and parse JSON
      const raw = await db.get(profileKey);
      const profile = (raw && typeof raw === 'object') ? raw : (typeof raw === 'string' ? JSON.parse(raw) : {});
      let xp = Number(profile.xp || 0);
      let level = Number(profile.level || 0); 

      xp += xpGain;
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
        const levelReward = 10000 * level;
        totalCoinReward += levelReward;
      }

      if (leveledUp) {
        profile.level = level;
        const econKey = `eco:${userId}:money`;
        const currentBalance = Number(await db.get(econKey) || 0);
        await db.set(econKey, currentBalance + totalCoinReward);

        const progressBarsCount = 10;
        const currentProgress = Math.min(Math.floor((xp / needed) * progressBarsCount), progressBarsCount);
        const progressBarStr = "🟩".repeat(currentProgress) + "⬛".repeat(progressBarsCount - currentProgress);

        const lvlEmbed = new EmbedBuilder()
          .setColor("#0A0A0A")
          .setTitle("✨ Level Up")
          .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setDescription(`Congratulations! Your active participation has progressed your profile account status.`)
          .addFields(
            { name: "📈 Level Up", value: `\`From Level ${initialLevel}\` ➔ \`To Level ${level}\``, inline: true },
            { name: "💰 Level Reward", value: `🪙 **+${totalCoinReward.toLocaleString()}** coins earned`, inline: true },
            { name: "✨ Booster In Use", value: isUserPremium ? "`2.0x Premium Active`" : "`1.0x Standard`", inline: true },
            { name: "📊 Next Progression Stage", value: `${progressBarStr} \`${xp} / ${needed} XP\``, inline: false }
          )
          .setTimestamp();

        message.channel.send({ embeds: [lvlEmbed] }).catch(() => {});
      }
      
      profile.xp = xp;
      // ✅ Store as JSON string
      await db.set(profileKey, JSON.stringify(profile));
    }

    // ==========================================
    // 🤖 AUTO RESPONDER
    // ==========================================
    const key = content.toLowerCase().trim();
    const responderRaw = await db.get(`responder:${guildId}:${key}`);
    if (responderRaw) {
      const responder = typeof responderRaw === 'object' ? responderRaw : JSON.parse(responderRaw);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(responder.color || "#0A0A0A")
            .setTitle(responder.title)
            .setDescription(responder.reply)
        ]
      });
    }

    // ==========================================
    // 💬 PREFIX COMMANDS (optional)
    // ==========================================
    if (content.startsWith("!")) {
      // your existing prefix command logic...
    }
  }
};

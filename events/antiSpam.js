// events/antiSpam.js
const { Events, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client, db) {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    /* =========================
       FAST SINGLE CONFIG READ
    ========================= */
    const premium = await db.get(`premium:guild:${guildId}`);
    const enabled = await db.get(`antispam:${guildId}:enabled`);

    if (!premium || premium === "false") return;
    if (enabled !== "true") return;

    if (message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) return;

    /* =========================
       COOLDOWN LOCK (PREVENT DOUBLE TRIGGERS)
    ========================= */
    const lockKey = `spamlock:${guildId}:${userId}`;
    const locked = await db.get(lockKey);

    if (locked) return;

    const now = Date.now();
    const key = `spam:${guildId}:${userId}`;

    /* =========================
       TRACK MESSAGES (Using Array Storage via DB)
    ========================= */
    let recentTimestamps = (await db.get(key)) || [];
    if (!Array.isArray(recentTimestamps)) recentTimestamps = [];

    recentTimestamps.push(now);
    
    // Simulate ltrim - keep the last 10 elements max
    if (recentTimestamps.length > 10) {
      recentTimestamps = recentTimestamps.slice(-10);
    }
    await db.set(key, recentTimestamps);

    // Filter recent messages sent within the 3.5s window
    const recent = recentTimestamps.map(Number).filter(t => now - t < 3500);

    /* =========================
       THRESHOLDS
    ========================= */
    const LIMIT = 6;
    const CRITICAL = 9;

    const severity =
      recent.length >= CRITICAL ? "CRITICAL"
      : recent.length >= LIMIT ? "HIGH"
      : null;

    if (!severity) return;

    await db.del(key);

    /* =========================
       SET COOLDOWN LOCK (10 MIN SAFE BUFFER)
    ========================= */
    await db.set(lockKey, "1"); // Sets lock state
    // Simple custom timeout mechanism to release lock since Mongo isn't natively expiring this key
    setTimeout(async () => {
      await db.del(lockKey).catch(() => {});
    }, 600 * 1000);

    try {
      /* =========================
         DELETE USER MESSAGES (SAFE MODE)
      ========================= */
      const messages = await message.channel.messages.fetch({ limit: 20 }).catch(() => null);

      if (messages) {
        const filtered = messages.filter(m => m.author.id === userId);

        if (filtered.size > 0) {
          await message.channel.bulkDelete(filtered, true).catch(() => null);
        }
      }

      /* =========================
         TIMEOUT SYSTEM
      ========================= */
      const duration = severity === "CRITICAL"
        ? 2 * 60 * 60 * 1000
        : 30 * 60 * 1000;

      await message.member.timeout(
        duration,
        `Anti-Spam (${severity})`
      ).catch(() => null);

      /* =========================
         USER NOTICE
      ========================= */
      const warn = await message.channel.send({
        content: `🚨 **Anti-Spam (${severity})** → ${message.author} temporarily restricted.`
      });

      setTimeout(() => warn.delete().catch(() => null), 4000);

      /* =========================
         AUDIT LOG
      ========================= */
      const logId = await db.get(`modlog_channel:${guildId}`);
      if (!logId) return;

      const logChannel = await message.guild.channels.fetch(logId).catch(() => null);
      if (!logChannel) return;

      await logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(severity === "CRITICAL" ? "#FF0033" : "#FF9900")
            .setTitle("⚡ Anti-Spam Triggered")
            .setDescription(
              `👤 **User:** ${message.author.tag}\n` +
              `⚡ **Severity:** ${severity}\n` +
              `📨 **Burst:** ${recent.length} messages / 3.5s\n` +
              `⏱ **Timeout:** ${duration / 60000} minutes\n` +
              `🧹 **Action:** Message cleanup + timeout applied`
            )
            .setTimestamp()
        ]
      }).catch(() => null);

    } catch (err) {
      console.error("AntiSpam Engine Error:", err);
    }
  }
};

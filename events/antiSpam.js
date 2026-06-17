const { Events, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client, redis) {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    /* =========================
       FAST SINGLE CONFIG READ
    ========================= */
    const config = await redis.mget(
      `premium:guild:${guildId}`,
      `antispam:${guildId}:enabled`
    );

    const premium = config[0];
    const enabled = config[1];

    if (!premium || premium === "false") return;
    if (enabled !== "true") return;

    if (message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) return;

    /* =========================
       COOLDOWN LOCK (PREVENT DOUBLE TRIGGERS)
    ========================= */
    const lockKey = `spamlock:${guildId}:${userId}`;
    const locked = await redis.get(lockKey);

    if (locked) return;

    const now = Date.now();
    const key = `spam:${guildId}:${userId}`;

    /* =========================
       TRACK MESSAGES
    ========================= */
    await redis.rpush(key, now);
    await redis.ltrim(key, -10, -1);

    const raw = await redis.lrange(key, 0, -1);
    const recent = raw.map(Number).filter(t => now - t < 3500);

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

    await redis.del(key);

    /* =========================
       SET COOLDOWN LOCK (10 MIN SAFE BUFFER)
    ========================= */
    await redis.set(lockKey, "1", "EX", 600);

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
        content: `${e.error || "🚨"} **Anti-Spam (${severity})** → ${message.author} temporarily restricted.`
      });

      setTimeout(() => warn.delete().catch(() => null), 4000);

      /* =========================
         AUDIT LOG
      ========================= */
      const logId = await redis.get(`modlog_channel:${guildId}`);
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

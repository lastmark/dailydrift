const { Events, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client, redis) {
    // Skip system checks for bots, webhooks, or DM matrices
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    // 1. Concurrently fetch Premium license and Anti-Spam toggle states from Redis cache memory
    const [isPremium, antiSpamToggle] = await Promise.all([
      redis.get(`premium:guild:${guildId}`),
      redis.get(`antispam:toggle:${guildId}`)
    ]);

    // Hard block execution if the guild isn't premium OR if they toggled the shield off via /premium-set
    if (!isPremium || antiSpamToggle === "false") return; 

    // Skip immune entities (Moderators / Admins)
    if (message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) return;

    // 2. High-Performance Sliding Window Rate Limiter
    const redisKey = `spam:${guildId}:${userId}`;
    const currentTime = Date.now();
    
    // Push timestamp into user's activity array log
    await redis.rpush(redisKey, currentTime);
    // Keep window clean: only store transactions from the last 3000 milliseconds (3 seconds)
    await redis.ltrim(redisKey, -10, -1); 

    const timestamps = await redis.lrange(redisKey, 0, -1);
    const recentMessages = timestamps.filter(ts => currentTime - parseInt(ts) < 3000);

    // Threshold Limit: More than 5 messages in 3 seconds trigger lockdown protocols
    if (recentMessages.length > 5) {
      await redis.del(redisKey); // Clear tracking lock quickly to avoid double execution loops

      try {
        // Isolate and purge recent messages sent by this target in the channel
        const channelMessages = await message.channel.messages.fetch({ limit: 20 }).catch(() => null);
        if (channelMessages) {
          const userSpam = channelMessages.filter(m => m.author.id === userId);
          await message.channel.bulkDelete(userSpam).catch(() => null);
        }

        // Apply a strict 2-hour security isolation block (Timeout)
        await message.member.timeout(120 * 60 * 1000, "Premium Anti-Spam Security Protocol Execution.");

        // Alert public channel room safely
        const warning = await message.channel.send({
          content: `${e.error || "🚨"} **Spam Deflected:** ${message.author} has been placed in a 2-hour timeout state for flooding communication channels.`
        });
        setTimeout(() => warning.delete().catch(() => null), 6000);

        // Forward deep metrics over to your secure Auto-Logs hook if configured
        const logChannelId = await redis.get(`modlog_channel:${guildId}`);
        if (logChannelId) {
          const logChannel = await message.guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const auditEmbed = new EmbedBuilder()
              .setColor("#FF3366")
              .setAuthor({ name: "Premium Security System", iconURL: message.author.displayAvatarURL() })
              .setDescription(`${e.lock || "🔒"} **Action:** AUTOMATED TIMEOUT\n${e.profile || "👤"} **Target:** ${message.author.username} (\`${userId}\`)\n⚡ **Trigger:** Sent \`${recentMessages.length}\` messages within a 3-second vector.\n⏱️ **Sanction Duration:** 2 Hours\n🧹 **Action Log:** Cleaned spammed channel entries.`)
              .setTimestamp();
            await logChannel.send({ embeds: [auditEmbed] }).catch(() => null);
          }
        }
      } catch (err) {
        console.error("Anti-Spam Execution Fault:", err);
      }
    }
  }
};

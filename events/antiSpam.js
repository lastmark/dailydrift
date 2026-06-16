const { Events, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client, redis) {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    const [isPremium, antiSpamToggle] = await Promise.all([
      redis.get(`premium:guild:${guildId}`),
      redis.get(`antispam:toggle:${guildId}`)
    ]);

    if (!isPremium || isPremium === "false" || antiSpamToggle === "false") return; 

    if (message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) return;

    const redisKey = `spam:${guildId}:${userId}`;
    const currentTime = Date.now();
    
    await redis.rpush(redisKey, currentTime);
    await redis.ltrim(redisKey, -10, -1); 

    const timestamps = await redis.lrange(redisKey, 0, -1);
    const recentMessages = timestamps.filter(ts => currentTime - parseInt(ts) < 3000);

    if (recentMessages.length > 5) {
      await redis.del(redisKey); 

      try {
        const channelMessages = await message.channel.messages.fetch({ limit: 20 }).catch(() => null);
        if (channelMessages) {
          const userSpam = channelMessages.filter(m => m.author.id === userId);
          await message.channel.bulkDelete(userSpam).catch(() => null);
        }

        await message.member.timeout(120 * 60 * 1000, "Premium Anti-Spam Security Protocol Execution.");

        const warning = await message.channel.send({
          content: `${e.error || "🚨"} **Spam Deflected:** ${message.author} has been placed in a 2-hour timeout state for flooding communication channels.`
        });
        setTimeout(() => warning.delete().catch(() => null), 6000);

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

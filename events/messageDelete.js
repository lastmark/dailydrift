// events/messageDelete.js – Ghost ping detector
const { Events, EmbedBuilder } = require("discord.js");

module.exports = {
  name: Events.MessageDelete,

  async execute(message, client, db) {
    // Ignore bots, DMs, or partial messages
    if (!message.guild || message.author?.bot || message.partial) return;

    const guildId = message.guild.id;

    // Check if ghost ping detection is enabled
    const enabled = await db.get(`antighostping:${guildId}`);
    if (enabled !== "true" && !enabled) return;

    // Only log if the message contained any mentions (user, role, or everyone)
    const mentions = [
      ...message.mentions.users.values(),
      ...message.mentions.roles.values(),
    ];
    if (message.mentions.everyone) mentions.push({ id: "everyone", toString: () => "@everyone" });

    if (mentions.length === 0) return;

    // Build embed
    const embed = new EmbedBuilder()
      .setColor("#ED4245")
      .setAuthor({ name: message.author?.tag || "Unknown", iconURL: message.author?.displayAvatarURL({ dynamic: true }) })
      .setDescription(
        `**Ghost ping detected!**\n` +
        `A message containing mentions was deleted.\n\n` +
        `**Author:** ${message.author} (${message.author?.id})\n` +
        `**Channel:** ${message.channel}\n` +
        `**Mentions:** ${mentions.map(m => m.toString()).join(", ")}\n` +
        `**Content:** ${message.content || "*No content (embed only)*"}`
      )
      .setFooter({ text: `Message ID: ${message.id}` })
      .setTimestamp();

    // Check if a dedicated log channel is configured
    const logChannelId = await db.get(`antighostping:channel:${guildId}`);
    if (logChannelId) {
      const logChannel = message.guild.channels.cache.get(logChannelId) || 
                         await message.guild.channels.fetch(logChannelId).catch(() => null);
      if (logChannel) {
        return logChannel.send({ embeds: [embed] });
      }
    }

    // Fallback: send to the channel where the message was deleted
    await message.channel.send({ embeds: [embed] }).catch(() => {});
  }
};

// commands/rename-vip.js
const { SlashCommandBuilder, ChannelType, MessageFlags } = require("discord.js");

module.exports = {
  category: "Server",

  data: new SlashCommandBuilder()
    .setName("rename-vip")
    .setDescription("Rename your VIP voice channel")
    .addStringOption(opt =>
      opt.setName("name")
        .setDescription("New name (max 32 characters)")
        .setRequired(true)
        .setMaxLength(32)
    ),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ You need to be in a voice channel to rename it.",
        flags: MessageFlags.Ephemeral
      });
    }

    const guildId = interaction.guild.id;
    const channelId = voiceChannel.id;

    // Check if this is a VIP channel
    const isVip = await redis.sismember(`vip:${guildId}:createdChannels`, channelId);
    if (!isVip) {
      return interaction.reply({
        content: "❌ That is not a VIP channel.",
        flags: MessageFlags.Ephemeral
      });
    }

    // Check ownership
    const owner = await redis.hget(`vip:${guildId}:${channelId}`, "owner");
    if (owner !== userId) {
      return interaction.reply({
        content: "❌ You don't own this channel.",
        flags: MessageFlags.Ephemeral
      });
    }

    const newName = interaction.options.getString("name");

    try {
      await voiceChannel.setName(newName, `Renamed by ${interaction.user.tag}`);
      return interaction.reply({
        content: `✅ Channel renamed to **${newName}**.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error("Rename error:", error);
      return interaction.reply({
        content: `❌ Failed to rename: ${error.message}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setleave")
    .setDescription("Configure or update the leave channel for this server.")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("The channel where leave messages should be sent")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction, client, redis) {
    const guildId = interaction.guild.id;
    const targetChannel = interaction.options.getChannel("channel");

    // Safety check
    if (!targetChannel) {
      return interaction.reply({
        content: "❌ Invalid channel selected.",
        flags: [MessageFlags.Ephemeral]
      });
    }

    // Save config
    await redis.set(`leave:${guildId}`, targetChannel.id);

    const embed = new EmbedBuilder()
      .setColor(0xFF4500)
      .setTitle("⚙️ Leave System Configured")
      .setDescription("Leave messages will now be routed correctly.")
      .addFields(
        {
          name: "📍 Module",
          value: "Leave System",
          inline: true
        },
        {
          name: "💬 Channel",
          value: `${targetChannel}`,
          inline: true
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Updated by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL()
      });

    return interaction.reply({ embeds: [embed] });
  }
};

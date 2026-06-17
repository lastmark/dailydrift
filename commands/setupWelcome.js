const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require("discord.js");

module.exports = {
  category: "Server Management",
  data: new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Configure or update the welcome channel for this server.")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("The channel where welcome messages should be sent")
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

    // Save to Redis
    await redis.set(`welcome:${guildId}`, targetChannel.id);

    const embed = new EmbedBuilder()
      .setColor(0x00FF7F)
      .setTitle("⚙️ Welcome System Configured")
      .setDescription("New members will now receive welcome messages here.")
      .addFields(
        {
          name: "📍 Module",
          value: "Welcome System",
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

// commands/slowmode.js – Channel Throughput Regulator
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Configure message rate-limiting for this channel")
    .addIntegerOption(opt =>
      opt.setName("seconds")
        .setDescription("Interval (0-21600s). 0 to disable.")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const seconds = interaction.options.getInteger("seconds");

    try {
      await interaction.channel.setRateLimitPerUser(seconds);
      
      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Dark minimalist theme
        .setTitle(seconds === 0 ? "✅ Throughput Restored" : "🐢 Throughput Throttled")
        .setDescription(seconds === 0 
          ? "Rate limiting has been disabled." 
          : `Messages limited to one per **${seconds}** second(s).`)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error("Slowmode Configuration Fault:", err);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor("#BA1A1A").setDescription("❌ **System Fault:** Insufficient permissions to modify channel constraints.")],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

// commands/slowmode.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode in the current channel")
    .addIntegerOption(opt =>
      opt.setName("seconds")
        .setDescription("Seconds between messages (0 to disable)")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ You need the **Manage Channels** permission.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    const seconds = interaction.options.getInteger("seconds");
    try {
      await interaction.channel.setRateLimitPerUser(seconds);
      if (seconds === 0) {
        const embed = new EmbedBuilder().setColor("#57F287").setDescription("✅ Slowmode has been **disabled**.");
        return interaction.reply({ embeds: [embed] });
      }
      const embed = new EmbedBuilder()
        .setColor("#FEE75C")
        .setDescription(`🐢 Slowmode set to **${seconds}** second(s).`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ Failed to set slowmode.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

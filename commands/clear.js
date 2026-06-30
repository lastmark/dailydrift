// commands/purge.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete a number of messages from the current channel")
    .addIntegerOption(opt =>
      opt.setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ You need the **Manage Messages** permission.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    const amount = interaction.options.getInteger("amount");
    try {
      await interaction.channel.bulkDelete(amount, true);
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setDescription(`🗑 Successfully deleted **${amount}** messages.`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      console.error(err);
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ Failed to purge messages.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

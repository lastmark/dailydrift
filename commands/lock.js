// commands/lock.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock the current channel (deny Send Messages for @everyone)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ You need the **Manage Channels** permission.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false
      });
      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("🔒 This channel has been **locked**.")
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ Failed to lock channel.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

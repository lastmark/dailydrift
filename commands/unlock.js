// commands/unlock.js – Channel Access Restoration
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Restore message sending capabilities for the channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    try {
      // Restore default permission state (null removes the explicit deny)
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null
      });

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist theme
        .setTitle("🔓 Channel Access Restored")
        .setDescription("The channel has been unlocked. Communication is now permitted for all members.")
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error("Unlock Pipeline Exception:", err);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **System Fault:** Unable to modify channel permissions.")
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

// commands/lock.js – Channel Permission Lock Engine
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Freeze text transmission matrices across this channel segment")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction, client, db) {
    // Confirm permission authority of the moderator node
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ **Access Denied:** Execution requires `ManageChannels` authorization metrics.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    try {
      // Modify channel overwrites for the @everyone role to deny text traffic transmission
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false
      });

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist styling layout
        .setTitle("🔒 Channel Sector Locked")
        .setDescription(`Text buffer streaming has been halted on this node segment.`)
        .addFields(
          { name: "📡 Sector Identity", value: `<#${interaction.channel.id}>`, inline: true },
          { name: "🔒 Transmission Rules", value: "`SendMessages ➔ DISABLED`", inline: true }
        )
        .setFooter({ text: "Administrative Lockout Active" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } catch (err) {
      console.error("Lock command pipeline exception:", err);
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ **Internal Exception:** Failed to patch authorization fields on this text buffer.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

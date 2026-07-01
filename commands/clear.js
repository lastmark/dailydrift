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

  async execute(interaction, client, db) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ Administrative authority failure: Missing `ManageMessages` permission flag.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const amount = interaction.options.getInteger("amount");

    try {
      // Bulk delete messages (true skips messages older than 14 days automatically per Discord limitations)
      const deleted = await interaction.channel.bulkDelete(amount, true);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist styling layout
        .setTitle("🗑️ Buffer Cleared Successfully")
        .setDescription(`Channel history data blocks have been modified.`)
        .addFields(
          { name: "⚡ Requested Block Size", value: `\`${amount}\``, inline: true },
          { name: "🧹 Actually Purged", value: `\`${deleted.size}\` messages`, inline: true }
        )
        .setFooter({ text: "Note: Messages exceeding a 14-day duration cannot be bulk deleted." })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } catch (err) {
      console.error(err);
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ Internal Exception: Could not clear text buffers on this specific channel sector.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

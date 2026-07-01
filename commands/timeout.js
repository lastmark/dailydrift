// commands/timeout.js – Administrative Member Throttling
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Apply a temporary communication restriction to a member")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("Target member to throttle")
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName("minutes")
        .setDescription("Duration in minutes (1–40320)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320))
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("Justification for the action")
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const minutes = interaction.options.getInteger("minutes");
    const reason = interaction.options.getString("reason") || "No justification provided";

    try {
      const member = await interaction.guild.members.fetch(user.id);
      
      // Attempt timeout application
      await member.timeout(minutes * 60 * 1000, reason);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist theme
        .setTitle("⏳ Member Communication Throttled")
        .addFields(
          { name: "Subject", value: `${user}`, inline: true },
          { name: "Duration", value: `\`${minutes}\` minute(s)`, inline: true },
          { name: "Justification", value: reason, inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
      
    } catch (err) {
      console.error("Timeout Pipeline Exception:", err);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Operation Failed:** Unable to apply timeout. (Ensure the user is not higher in the hierarchy than the bot).")
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

// commands/timeout.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("User to timeout")
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName("minutes")
        .setDescription("Duration in minutes")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320))
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("Reason for the timeout")
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ You need the **Moderate Members** permission.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser("user");
    const minutes = interaction.options.getInteger("minutes");
    const reason = interaction.options.getString("reason") || "No reason provided";
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.timeout(minutes * 60 * 1000, reason);
      const embed = new EmbedBuilder()
        .setColor("#FEE75C")
        .setTitle("⏳ Member Timed Out")
        .setDescription(`**${user.tag}** has been timed out for **${minutes}** minute(s).\n**Reason:** ${reason}`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ I cannot timeout that user.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

// commands/untimeout.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a timeout from a member")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("User to remove timeout from")
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ You need the **Moderate Members** permission.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser("user");
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.timeout(null);
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ Timeout Removed")
        .setDescription(`The timeout for **${user.tag}** has been removed.`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ I cannot remove the timeout from that user.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

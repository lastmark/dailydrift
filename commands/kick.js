// commands/kick.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("User to kick")
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("Reason for the kick")
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.KickMembers)) {
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ You need the **Kick Members** permission.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason provided";
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.kick(reason);
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("👢 Member Kicked")
        .setDescription(`**${user.tag}** has been kicked.\n**Reason:** ${reason}`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      const embed = new EmbedBuilder().setColor("#ED4245").setDescription("❌ I cannot kick that user.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

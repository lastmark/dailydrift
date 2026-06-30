// commands/ban.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("User to ban")
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("Reason for the ban")
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: "❌ You need Ban Members permission.", flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason provided";
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.ban({ reason });
      return interaction.reply(`🔨 Banned **${user.tag}**\nReason: ${reason}`);
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "❌ I cannot ban that user.", flags: MessageFlags.Ephemeral });
    }
  }
};

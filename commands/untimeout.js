// commands/untimeout.js – Member Communication Restoration
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Lift the communication restriction from a member")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("Target member to unthrottle")
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser("user");

    try {
      const member = await interaction.guild.members.fetch(user.id);
      
      // Pass null to remove active timeout
      await member.timeout(null);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist theme
        .setTitle("✅ Communication Restored")
        .setDescription(`The timeout restriction has been successfully lifted for **${user.tag}**.`)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error("Untimeout Pipeline Exception:", err);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Operation Failed:** Unable to lift timeout. Please verify hierarchy and permissions.")
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

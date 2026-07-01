// commands/ban.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

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

  async execute(interaction, client, db) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ Administrative authority failure: Missing `BanMembers` permission flag.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason provided";

    try {
      const member = await interaction.guild.members.fetch(user.id);
      
      // Ensure the bot isn't trying to target someone higher up in the hierarchy
      if (!member.bannable) {
        const embed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ Operation denied: Target user holds role hierarchy higher than or equal to this client instance.");
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      await member.ban({ reason });

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist styling layout
        .setTitle("🔨 Action Completed: Account Terminated")
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(`The profile network node has been severed from this guild infrastructure.`)
        .addFields(
          { name: "👤 Targets Address", value: `**${user.tag}** (\`${user.id}\`)`, inline: true },
          { name: "💬 Logged Context", value: `\`\`\`text\n${reason}\n\`\`\``, inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ Internal Exception: Could not resolve or process ban request for this target identity.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

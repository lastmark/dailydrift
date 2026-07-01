// commands/kick.js – Advanced Node Severance Engine
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Sever and evict a member profile node from the server matrix")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("Target user node to disconnect")
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("Reason for severance log registration")
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),

  async execute(interaction, client, db) {
    // Structural client permissions confirmation
    if (!interaction.memberPermissions.has(PermissionFlagsBits.KickMembers)) {
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ **Access Denied:** Execution requires `KickMembers` authorization metrics.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No descriptive baseline reason logged.";

    try {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      
      if (!member) {
        const embed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Registry Missing:** The requested user node cannot be resolved inside this cluster.");
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Hierarchy validation safety checks
      if (!member.kickable) {
        const embed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Privilege Escalation Blocked:** The application client holds insufficient hierarchy depth to disconnect this node.");
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
        const embed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Hierarchy Infringement:** Your role clearance ranking sits lower than or equal to the targeted profile.");
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Execute eviction sequence
      await member.kick(reason);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist styling layout
        .setTitle("👢 Member Node Disconnected")
        .setDescription(`An explicit profile extraction sequence was executed.`)
        .addFields(
          { name: "👤 Evicted Account", value: `<@${user.id}> | \`${user.tag}\``, inline: true },
          { name: "🛡️ Enforcing Officer", value: `${interaction.user}`, inline: true },
          { name: "📝 Incident Log Reason", value: `\`${reason}\``, inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } catch (err) {
      console.error("Kick script processing failure:", err);
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ **Internal Exception:** Critical failure during severance pipeline processing.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

// commands/antighostping.js – Toggle ghost ping detection (Premium Infrastructure)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");

module.exports = {
  category: "Premium",
  data: new SlashCommandBuilder()
    .setName("antighostping")
    .setDescription("Track and isolate deleted text blocks containing user mentions")
    .addSubcommand(sub =>
      sub.setName("enable")
        .setDescription("Enable ghost ping intercept logging for this node (Premium Required)")
    )
    .addSubcommand(sub =>
      sub.setName("disable")
        .setDescription("Deactivate ghost ping interception logs")
    ),

  async execute(interaction, client, db) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // Premium configuration structural verification
    const isPremium = await db.get(`premium:guild:${guildId}`);
    if (!isPremium) {
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ This feature requires an active Server Premium subscription.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Administrative access permission verification
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ You must have the Moderate Members permission to use this command.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ==================== ENABLE SYSTEM ====================
    if (sub === "enable") {
      await db.set(`antighostping:${guildId}`, "enabled");
      
      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist styling layout
        .setTitle("👻 Ghost Ping Detection")
        .setDescription("Detects and logs ghost pings by monitoring deleted messages that contain user mentions.")
        .addFields(
          { name: "Detection Status", value: "`Enabled`", inline: true },
          { name: "Log Actions", value: "`Deleted blocks with mentions will intercept`", inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ==================== DISABLE SYSTEM ====================
    if (sub === "disable") {
      await db.del(`antighostping:${guildId}`);
      
      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setDescription("🟢 **System Disarmed:** Ghost ping tracing modules turned offline cleanly.");

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

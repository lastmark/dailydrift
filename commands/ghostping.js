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
        .setDescription("❌ **Premium Authorization Failure:** This processing pipeline requires server tier license keys.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Administrative access permission verification
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ **Access Denied:** Execution requires `Administrator` authorization metrics.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ==================== ENABLE SYSTEM ====================
    if (sub === "enable") {
      await db.set(`antighostping:${guildId}`, "enabled");
      
      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist styling layout
        .setTitle("🛡️ Packet Inspection Active")
        .setDescription("Ghost ping detection security array has been initialized successfully on this guild hub.")
        .addFields(
          { name: "📡 Pipeline Monitoring", value: "`ONLINE`", inline: true },
          { name: "📝 Log Actions", value: "`Deleted blocks with mentions will intercept`", inline: true }
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

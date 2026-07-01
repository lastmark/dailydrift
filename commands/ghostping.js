// commands/antighostping.js – Simple Ghost Ping Toggle (Premium)
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
    .setDescription("Enable or disable ghost ping detection")
    .addBooleanOption(opt =>
      opt.setName("enabled")
        .setDescription("True to enable, False to disable")
        .setRequired(true)
    ),

  async execute(interaction, client, db) {
    const guildId = interaction.guild.id;
    const enabled = interaction.options.getBoolean("enabled");

    // Premium check
    const isPremium = await db.get(`premium:guild:${guildId}`);
    if (!isPremium) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#ED4245")
            .setDescription("❌ This feature requires **Guild Premium**.")
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // Admin check
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#ED4245")
            .setDescription("❌ You need **Administrator** permission.")
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    if (enabled) {
      await db.set(`antighostping:${guildId}`, "enabled");
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setDescription("✅ Ghost ping detection is now **enabled**.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else {
      await db.del(`antighostping:${guildId}`);
      const embed = new EmbedBuilder()
        .setColor("#FEE75C")
        .setDescription("✅ Ghost ping detection is now **disabled**.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

// commands/antighostping.js – Toggle ghost ping detection (premium)
const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");

module.exports = {
  category: "Premium",
  data: new SlashCommandBuilder()
    .setName("antighostping")
    .setDescription("Detect deleted messages that contain mentions")
    .addSubcommand(sub =>
      sub.setName("enable")
        .setDescription("Enable ghost ping detection for this server (premium)")
    )
    .addSubcommand(sub =>
      sub.setName("disable")
        .setDescription("Disable ghost ping detection")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // Premium check
    const isPremium = await redis.get(`premium:guild:${guildId}`);
    if (!isPremium) {
      return interaction.reply({
        content: "❌ This feature is only available for premium servers.",
        flags: MessageFlags.Ephemeral
      });
    }

    // Admin only
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ You need Administrator permission.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === "enable") {
      await redis.set(`antighostping:${guildId}`, "enabled");
      return interaction.reply({
        content: "✅ Ghost ping detection is now **enabled**.\nDeleted messages with mentions will be logged.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === "disable") {
      await redis.del(`antighostping:${guildId}`);
      return interaction.reply({
        content: "✅ Ghost ping detection is now **disabled**.",
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

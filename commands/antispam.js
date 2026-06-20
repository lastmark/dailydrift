// commands/antispam.js – Premium‑only anti‑spam configuration
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  category: "Premium",
  data: new SlashCommandBuilder()
    .setName("antispam")
    .setDescription("Configure anti‑spam protection (Premium)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName("status")
        .setDescription("Enable or disable anti‑spam")
        .setRequired(true)
        .addChoices(
          { name: "Enabled", value: "true" },
          { name: "Disabled", value: "false" }
        )
    )
    .addStringOption(opt =>
      opt.setName("level")
        .setDescription("Detection sensitivity")
        .setRequired(false)
        .addChoices(
          { name: "Low (Safer)", value: "low" },
          { name: "Medium (Balanced)", value: "medium" },
          { name: "High (Strict)", value: "high" }
        )
    ),

  async execute(interaction, client, redis) {
    const guildId = interaction.guildId;

    // ---- PREMIUM CHECK ----
    const premium = await redis.get(`premium:guild:${guildId}`);
    if (!premium) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle("🔒 Premium Required")
            .setDescription("Anti‑spam is a **Guild Premium** feature. Upgrade to premium to unlock it.")
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const status = interaction.options.getString("status");
    const level = interaction.options.getString("level") || "medium";

    await redis.set(`antispam:${guildId}:enabled`, status);
    await redis.set(`antispam:${guildId}:level`, level);

    const embed = new EmbedBuilder()
      .setColor(status === "true" ? "#57F287" : "#ED4245")
      .setTitle("🛡️ Anti‑Spam Configuration")
      .addFields(
        { name: "Status", value: status === "true" ? "✅ Enabled" : "❌ Disabled", inline: true },
        { name: "Sensitivity", value: level.toUpperCase(), inline: true }
      )
      .setFooter({ text: "Changes take effect immediately." })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};

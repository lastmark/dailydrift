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

  async execute(interaction, client, db) {
    const guildId = interaction.guildId;

    // ---- PREMIUM CHECK ----
    const premium = await db.get(`premium:guild:${guildId}`);
    if (!premium) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#BA1A1A") // Minimalist deep-red alert tint
            .setTitle("🔒 Premium Subscription Required")
            .setDescription("This feature is only available to servers with **Guild Premium**.")
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const status = interaction.options.getString("status");
    const level = interaction.options.getString("level") || "medium";

    // Set settings within the MongoDB store
    await db.set(`antispam:${guildId}:enabled`, status);
    await db.set(`antispam:${guildId}:level`, level);

    const embed = new EmbedBuilder()
      .setColor("#0A0A0A") // Premium dark minimalist styling layout
      .setTitle("🛡️ Anti-Spam Configuration")
      .setDescription("settings have been updated successfully..")
      .addFields(
        { name: "Spam Protection", value: status === "true" ? "🟢 `Active`" : "🔴 `Disabled`", inline: true },
        { name: "Detection Level", value: `\`${level.toUpperCase()}\``, inline: true }
      )
      .setFooter({ text: "Anti-Spam System" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};

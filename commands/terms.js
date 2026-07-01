// commands/terms.js – Terms of Service Agreement Interface
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { TERMS_VERSION } = require("../config.js");

module.exports = {
  category: "Information",
  data: new SlashCommandBuilder()
    .setName("terms")
    .setDescription("View and accept the latest Terms of Service agreement"),

  async execute(interaction, client, db) {
    const userId = interaction.user.id;

    // Check acceptance status in MongoDB
    const acceptedVersion = await db.get(`terms:accepted:${userId}`);
    
    if (acceptedVersion === TERMS_VERSION) {
      return interaction.reply({
        content: "✅ **Compliance Confirmed:** You have already accepted the current Terms of Service.",
        flags: MessageFlags.Ephemeral
      });
    }

    const embed = new EmbedBuilder()
      .setColor("#0A0A0A") // Premium dark minimalist styling
      .setTitle("📜 Terms of Service Agreement")
      .setDescription(
        "This bot (“Daily Drift”) operates under the following regulatory framework. " +
        "By accessing or using any command, feature, or functionality, you agree to be legally bound by these terms.\n\n" +
        "**1. Acceptance of Terms**\n" +
        "Access is conditional upon acceptance. Usage constitutes full agreement.\n\n" +
        "**2. Virtual Asset Policy**\n" +
        "Virtual currency ('coins') has no real-world monetary value, cannot be traded externally, and remains under full administrative control.\n\n" +
        "**3. User Conduct & Security**\n" +
        "Exploiting bugs, using unauthorized automation, or disruptive behavior is strictly prohibited. Violations trigger immediate penalties.\n\n" +
        "**4. Enforcement Rights**\n" +
        "Administrators reserve the right to suspend accounts, remove assets, or restrict access at their sole discretion.\n\n" +
        "**5. Limitation of Liability**\n" +
        "Service is provided “as-is.” Administrators are not responsible for loss of data, virtual assets, or service availability.\n\n" +
        "**6. Final Agreement**\n" +
        "Continued use constitutes acceptance of these terms and any future modifications."
      )
      .setFooter({ text: `Protocol Version ${TERMS_VERSION} • Daily Drift Infrastructure` })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("terms_accept")
          .setLabel("ACCEPT & AUTHORIZE")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("terms_deny")
          .setLabel("DENY & DISCONNECT")
          .setStyle(ButtonStyle.Danger)
      );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }
};

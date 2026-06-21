// commands/terms.js – Terms of Service with Accept/Deny
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { TERMS_VERSION } = require("../config.js");

module.exports = {
  category: "Information",
  data: new SlashCommandBuilder()
    .setName("terms")
    .setDescription("View and accept the Terms of Service"),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;

    const accepted = await redis.get(`terms:accepted:${userId}`);
    if (accepted === TERMS_VERSION) {
      return interaction.reply({
        content: "✅ You have already accepted the latest Terms of Service.",
        flags: MessageFlags.Ephemeral
      });
    }

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("📜 Terms of Service Agreement")
      .setDescription(
        "This bot (“Service”) is operated under the following Terms of Service. " +
        "By accessing or using any command, feature, or functionality of this bot, " +
        "you agree to be legally bound by these terms. If you do not agree, " +
        "you must immediately stop using the Service.\n\n" +
        "**1. Acceptance of Terms**\n" +
        "Access to and use of this Service is conditional upon acceptance of these Terms. " +
        "By using the bot in any way, you confirm your agreement.\n\n" +
        "**2. Virtual Currency System**\n" +
        "The Service may include virtual currency, points, or similar digital assets (“coins”).\n" +
        "You agree that:\n" +
        "• Coins have no real-world monetary value\n" +
        "• Coins cannot be exchanged, sold, traded, or redeemed for real money or goods\n" +
        "• Coins exist only within the Service and remain under full administrative control\n" +
        "• The Service may modify, reset, or remove coins at any time without compensation\n" +
        "Any attempt to exploit, transfer externally, or manipulate the system is strictly prohibited.\n\n" +
        "**3. User Conduct**\n" +
        "Users are strictly prohibited from:\n" +
        "• Exploiting bugs, glitches, or unintended behavior\n" +
        "• Using automated systems, scripts, or unauthorized tools\n" +
        "• Attempting to bypass restrictions or security measures\n" +
        "• Engaging in abusive, fraudulent, or disruptive activity\n" +
        "Violations may result in penalties including warnings, restrictions, or permanent bans.\n\n" +
        "**4. Enforcement Rights**\n" +
        "The administrators reserve the full right to:\n" +
        "• Restrict, suspend, or permanently ban any user at any time\n" +
        "• Remove virtual assets or progress without notice\n" +
        "• Enforce rules at their sole discretion\n" +
        "All enforcement actions are final unless explicitly stated otherwise by the administrators.\n\n" +
        "**5. Limitation of Liability**\n" +
        "The Service is provided on an “as-is” and “as-available” basis. " +
        "To the maximum extent permitted by applicable law, the administrators shall not be held responsible " +
        "for any loss of data, virtual assets, access, or functionality resulting from the use or inability to use the Service.\n\n" +
        "**6. Modifications to Terms**\n" +
        "These Terms may be updated, changed, or replaced at any time without prior notice. " +
        "Continued use of the Service after changes constitutes acceptance of the updated Terms.\n\n" +
        "**7. Final Agreement**\n" +
        "By using this bot, you confirm that you have read, understood, and agreed to these Terms in full.\n\n" +
        "To proceed, you must choose:"
      )
      .setFooter({ text: `Version ${TERMS_VERSION} • Daily Drift` })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("terms_accept")
          .setLabel("✅ Accept")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("terms_deny")
          .setLabel("❌ Deny")
          .setStyle(ButtonStyle.Danger)
      );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }
};

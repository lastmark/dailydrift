const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("📚 View the complete listing of interactive application modules and features."),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    // Fetch active licenses from Redis cache layers concurrently
    const [userPremium, guildPremium] = await Promise.all([
      redis.get(`premium:user:${userId}`),
      redis.get(`premium:guild:${guildId}`)
    ]);

    const userStatus = userPremium ? "💎 **User Premium Active**" : "Standard Tier";
    const guildStatus = guildPremium ? "💎 **Server Premium Active**" : "Standard Tier";

    const helpEmbed = new EmbedBuilder()
      .setColor(userPremium || guildPremium ? "#FFD700" : "#5865F2")
      .setAuthor({ name: `${client.user.username} Operational Directive Matrix`, iconURL: client.user.displayAvatarURL() })
      .setDescription(
        `Welcome to the primary help terminal console, ${interaction.user}.\n\n` +
        `⚙️ **Your System Access Frameworks:**\n` +
        `• **Your Profile Status:** ${userStatus}\n` +
        `• **Current Server Status:** ${guildStatus}\n\n` +
        `🔬 *To activate higher processing modules, check out our support pathways.*`
      )
      .addFields(
        {
          name: "👑 How to Get Premium & Active Perks",
          value:
            "💬 **How to Purchase:** Contact the bot developer (<@1303357369622990889>) directly or visit the support node to buy a license key.\n\n" +
            "✨ **User Premium Perks:** Unlocks personal profile card banner uploads, custom hex color profiles, and a network-wide permanent **2.0x XP & Economy Coin Multiplier**.\n\n" +
            "🏢 **Guild Premium Perks:** Unlocks advanced server automation systems including high-speed Anti-Spam protection loops, live voice-channel member statistics tracking boards, and custom rich-embed auto-responders.",
          inline: false
        },
        {
          name: "Sub-Section: Identity & Profile Utilities",
          value: 
            "`/profile view` - Render your premium-styled graphical profile canvas.\n" +
            "`/profile setbio` - Modify your biography parameters string (Max 80 chars).\n" +
            "`/profile reset` - Strip your customized background image back to default core assets.",
          inline: false
        },
        {
          name: "Sub-Section: Premium Member Options (User Tier)",
          value: 
            "`/profile upload` - 🖼️ Inject a custom 800x300 image backdrop layer onto your canvas card.\n" +
            "⚡ **Passive Boosts:** Automatically doubles your progression rate via our global multiplier engine hooks.",
          inline: false
        },
        {
          name: "Sub-Section: Server Administration Options (Guild Tier)",
          value: 
            "`/premium-set antispam` - Toggle high-velocity real-time message flood mitigation engine blocks.\n" +
            "`/premium-set setup-stats` - Deploy synchronized live member trackers onto voice room directory channels.\n" +
            "`/responder-set` - Map custom keywords directly onto automated deep rich interactive embeds.",
          inline: false
        },
        {
          name: "Sub-Section: Diagnostics & Core Tools",
          value: 
            "`/premium` - Query remaining expiration lifespans on active subscription configurations.\n" +
            "`/help` - Deploy this complete diagnostics reference handbook asset.",
          inline: false
        }
      )
      .setFooter({ text: "Application Core System Protocol • Created by Aryan Center Dev Division" })
      .setTimestamp();

    return await interaction.reply({ embeds: [helpEmbed] });
  }
};

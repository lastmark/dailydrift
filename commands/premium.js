// commands/premium.js – High-Aesthetic Premium Control Center
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  MessageFlags 
} = require("discord.js");

const DEV_ID = "1303357369622990889";

/**
 * Calculates remaining time from a stored expiry timestamp
 * @param {number|null} expiryTimestamp 
 * @returns {string} Formatted duration string
 */
function formatTTL(expiryTimestamp) {
  if (!expiryTimestamp) return "❌ Inactive";
  if (expiryTimestamp === -1) return "💎 Lifetime";
  
  const now = Date.now();
  const diff = expiryTimestamp - now;
  
  if (diff <= 0) return "❌ Expired";
  
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  
  return parts.length > 0 ? `⏳ **Active** • \`${parts.join(' ')}\` remaining` : "⏳ **Active** • `< 1m` remaining";
}

module.exports = {
  category: "Premium",
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("💎 Premium control center and feature showcase")
    .addSubcommand(sub =>
      sub.setName("info")
        .setDescription("View exclusive User and Guild tier benefits")
    )
    .addSubcommand(sub =>
      sub.setName("status")
        .setDescription("Check active subscriptions and server nodes")
    ),

  async execute(interaction, client, db) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // ── /premium info ──
    if (sub === "info") {
      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist aesthetic
        .setAuthor({ name: "PREMIUM MEMBERSHIP ARCHITECTURE", iconURL: client.user.displayAvatarURL() })
        .setDescription("Upgrade your operational capacity with exclusive user and guild-wide benefits.")
        .addFields(
          {
            name: "👤 User Premium Tier",
            value: "• **2× XP Scaling** — Accelerated progression.\n• **Reduced Cooldowns** — Optimized command throughput.\n• **Counting Buffs** — Streak protection and free daily shields.\n• **Enhanced Daily Credits** — 3x payout multiplier.\n• **Identity Customization** — Animated backgrounds and exclusive badges."
          },
          {
            name: "🏰 Guild Premium Tier",
            value: "• **Advanced Analytics** — Deep-dive activity tracking.\n• **Ghost Ping Intercept** — Log deleted mentions.\n• **VIP Infrastructure** — Unlimited privileged channel creation.\n• **Custom Graphic Assets** — Tailored join/leave branding.\n• **Automated Responses** — Advanced logic and regex support."
          },
          {
            name: "💳 Activation",
            value: "To initialize a subscription plan, access our support portal to generate an activation hash code."
          }
        )
        .setFooter({ text: "Thank you for supporting the infrastructure." })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── /premium status ──
    if (sub === "status") {
      // Assuming db structure stores expiry as a timestamp (number) or -1 (lifetime)
      const userSub = await db.get(`premium:user:${userId}`); // Expects { expiry: number|-1 }
      const guildSub = await db.get(`premium:guild:${guildId}`);

      const userExpiry = userSub?.expiry || null;
      const guildExpiry = guildSub?.expiry || null;

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle("💎 Subscription Status Registry")
        .setDescription("Validated status report for account and guild nodes.")
        .addFields(
          {
            name: "👤 Personal Node",
            value: userExpiry 
              ? `🟢 **Status: Enabled**\n${formatTTL(userExpiry)}` 
              : "⚫ **Status: Standard**\nNo active personal membership.",
            inline: false
          },
          {
            name: "🏰 Guild Node",
            value: guildExpiry 
              ? `🟢 **Status: Enabled**\n${formatTTL(guildExpiry)}` 
              : "⚫ **Status: Standard**\nThis server is currently operating on the free tier.",
            inline: false
          }
        )
        .setFooter({ text: "Use /redeem <code> to activate premium authorization." });

      if (userId === DEV_ID) {
        embed.addFields({
          name: "🔧 CORE SYSTEM DEPLOYMENT DEBUG",
          value: `\`\`\`User: ${JSON.stringify(userSub)}\nGuild: ${JSON.stringify(guildSub)}\`\`\``,
          inline: false
        });
      }

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

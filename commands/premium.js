// commands/premium.js – Fixed status display (supports "perm" string and timed objects)
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

const DEV_ID = "1303357369622990889";

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

  return parts.length > 0
    ? `⏳ **Active** • \`${parts.join(' ')}\` remaining`
    : "⏳ **Active** • `< 1m` remaining";
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
        .setColor("#0A0A0A")
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
      // ── User premium ──
      const userRaw = await db.get(`premium:user:${userId}`);
      let userExpiry = null;

      if (userRaw === "perm") {
        // Lifetime string
        userExpiry = -1;
      } else if (userRaw && typeof userRaw === "object" && userRaw.expiry) {
        // Object with expiry timestamp
        userExpiry = userRaw.expiry;
      } else if (userRaw === "active") {
        // Timed premium stored as "active" string – check TTL via db.ttl
        const ttl = await db.ttl(`premium:user:${userId}`);
        if (ttl > 0) {
          userExpiry = Date.now() + ttl * 1000;
        } else {
          userExpiry = null; // expired or missing
        }
      }

      // ── Guild premium ──
      const guildRaw = await db.get(`premium:guild:${guildId}`);
      let guildExpiry = null;

      if (guildRaw === "perm") {
        guildExpiry = -1;
      } else if (guildRaw && typeof guildRaw === "object" && guildRaw.expiry) {
        guildExpiry = guildRaw.expiry;
      } else if (guildRaw === "active") {
        const ttl = await db.ttl(`premium:guild:${guildId}`);
        if (ttl > 0) {
          guildExpiry = Date.now() + ttl * 1000;
        }
      }

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
          value: `\`\`\`User raw: ${JSON.stringify(userRaw)}\nGuild raw: ${JSON.stringify(guildRaw)}\`\`\``,
          inline: false
        });
      }

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

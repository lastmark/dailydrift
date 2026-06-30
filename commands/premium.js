// commands/premium.js – High-Aesthetic Premium Control Center
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags 
} = require("discord.js");

const DEV_ID = "1303357369622990889";

function formatTTL(ttl) {
  if (ttl === -1) return "💎 **LIFETIME UNLOCKED**";
  if (ttl <= 0) return "❌ EXPIRED / INACTIVE";
  const d = Math.floor(ttl / 86400);
  const h = Math.floor((ttl % 86400) / 3600);
  const m = Math.floor((ttl % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.length > 0 ? `⏳ **ACTIVE** • \`${parts.join(' ')}\` remaining` : "⏳ **ACTIVE** • `< 1m` remaining";
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

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // ── /premium info ──
 if (sub === "info") {
  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setAuthor({
      name: "Premium Memberships",
      iconURL: client.user.displayAvatarURL()
    })
    .setDescription(
      "Unlock exclusive benefits for yourself or enhance your entire server with premium features."
    )
    .addFields(
      {
        name: "👤 User Premium",
        value:
          "• **2× XP Boost** — Earn experience twice as fast.\n" +
          "• **Reduced Cooldowns** — Use commands more frequently.\n" +
          "• **Daily Shield** — Receive 1 free counting shield every 24 hours.\n" +
          "• **Mistake Protection** — One counting mistake won't break the streak each day.\n" +
          "• **Enhanced Daily Rewards** — Collect 600 daily coins instead of 200.\n" +
          "• **Animated Profiles** — Use custom GIF profile backgrounds.\n" +
          "• **Premium Badge** — Display an exclusive badge on your profile."
      },
      {
        name: "🏰 Guild Premium",
        value:
          "• **Advanced Statistics** — Voice activity and member tracking analytics.\n" +
          "• **Ghost Ping Detection** — Automatically log deleted mentions.\n" +
          "• **Unlimited VIP Channels** — Members can create as many VIP channels as needed.\n" +
          "• **Custom Welcome Images** — Personalized join and leave graphics.\n" +
          "• **Unlimited Auto Responses** — Powerful automated responses with regex support."
      },
      {
        name: "💳 Purchase Premium",
        value:
          "Interested in Premium? Join our support server and open a ticket to view available plans, pricing, and activation options."
      }
    )
    .setFooter({
      text: "Thank you for supporting the bot."
    })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}
    // ── /premium status ──
    if (sub === "status") {
      let userValue = await redis.get(`premium:user:${userId}`);
      let guildValue = await redis.get(`premium:guild:${guildId}`);

      let userTTL = 0;
      if (userValue === "perm") userTTL = -1;
      else if (userValue) {
        userTTL = await redis.ttl(`premium:user:${userId}`);
        if (userTTL < 0) userTTL = 0;
      }

      let guildTTL = 0;
      if (guildValue === "perm") guildTTL = -1;
      else if (guildValue) {
        guildTTL = await redis.ttl(`premium:guild:${guildId}`);
        if (guildTTL < 0) guildTTL = 0;
      }

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle("💎 Premium Status")
        .setDescription(`Current operational access limits verified for account \`${userId}\` across the current network server instance.`)
        .addFields(
          {
            name: "👤 Personal Membership",
            value: userValue ? formatTTL(userTTL) : "❌ **NO ACTIVE LICENSE**",
            inline: false
          },
          {
            name: "🏰 Guild Membership",
            value: guildValue ? formatTTL(guildTTL) : "❌ **RUNNING BASE standard tier**",
            inline: false
          }
        )
        .setFooter({ text: "Use /redeem <code> to provision activation licenses." });

      if (userId === DEV_ID) {
        embed.addFields({
          name: "🔧 CORE SYSTEM DEPLOYMENT DEBUG",
          value: `\`\`\`User: ${userValue || 'null'} (TTL: ${userTTL}s)\nGuild: ${guildValue || 'null'} (TTL: ${guildTTL}s)\`\`\``,
          inline: false
        });
      }

      // Action line row containing clean web link or operational pathways if wanted later
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

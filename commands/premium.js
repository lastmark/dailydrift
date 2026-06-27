// commands/premium.js – Status dashboard + Feature info
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

const DEV_ID = "1303357369622990889";

function formatTTL(ttl) {
  if (ttl === -1) return "♾️ Lifetime";
  if (ttl <= 0) return "❌ Expired";
  const d = Math.floor(ttl / 86400);
  const h = Math.floor((ttl % 86400) / 3600);
  const m = Math.floor((ttl % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.length > 0 ? `⏳ ${parts.join(' ')}` : "⏳ < 1 minute";
}

module.exports = {
  category: "Premium",

  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("💎 Premium dashboard & info")
    .addSubcommand(sub =>
      sub.setName("info")
        .setDescription("What do User Premium & Guild Premium give you?")
    )
    .addSubcommand(sub =>
      sub.setName("status")
        .setDescription("Check your active premium subscriptions")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // ── /premium info ──
    if (sub === "info") {
      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("💎 Premium Perks")
        .setDescription("Take your experience to the next level! We offer two types of premium:\n\n" +
          "**👤 User Premium** – personal benefits that follow you everywhere.\n" +
          "**🏰 Guild Premium** – server‑wide features that upgrade your whole community.")
        .addFields(
          {
            name: "👤 User Premium",
            value: [
              "• **2× XP** – permanent XP boost + shorter cooldown (30s instead of 60s)",
              "• **🛡️ Shield Regeneration** – get 1 free shield every 24h in counting",
              "• **❄️ Streak Freeze** – one mistake per day won't reset your counting streak",
              "• **☀️ Daily Bonus ×3** – 600 coins instead of 200",
              "• **🎞️ Animated Profile Backgrounds** – upload a GIF and see it move on your profile card",
              "• **✨ Premium Badge** – shiny “PREMIUM” tag on your profile",
              "• **📊 Extended Profile** – see up to 6 achievements instead of 3, and more social links",
              "• **🎨 More Customisation** – custom embed background, profile theme, XP bar styles"
            ].join("\n"),
            inline: false
          },
          {
            name: "🏰 Guild Premium",
            value: [
              "• **📈 Advanced Stats Channels** – live voice member count & “Joined Today” channel",
              "• **🛡️ Anti‑Spam** – automatic spam detection & deletion",
              "• **🎙️ Voice Stats** – real‑time display of how many members are in voice",
              "• **📅 Members Joined Today** – shows new members who joined in the last 24h",
              "• **🔊 Unlimited VIP Channels** – create as many premium voice/text channels as you want",
              "• **🎨 Custom Welcome/Leave Cards** – upload your own background for member join images",
              "• **🤖 Unlimited Auto‑Responder** – unlimited keywords, regex support, and rich embeds",
              "• **⚡ Priority Support** – faster ticket response & dedicated support role",
              "• **🛒 Server Shop** – create custom shop items (roles, etc.) purchasable with coins",
              "• **🔄 More coming soon** – suggestions are welcome!"
            ].join("\n"),
            inline: false
          },
          {
            name: "❓ How to get Premium",
            value: "Contact the bot owner or visit our support server. Premium can be purchased as a one‑time payment or subscription.",
            inline: false
          }
        )
        .setFooter({ text: "Thank you for supporting the bot! 💖" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── /premium status (default if no subcommand? We'll handle as sub) ──
    if (sub === "status") {
      // Fetch premium data
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
        .setColor("#F1C40F")
        .setAuthor({ name: "💎 Premium Dashboard", iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          {
            name: "👤 User Premium",
            value: userValue ? (userValue === "perm" ? "♾️ Lifetime" : `Active\n${formatTTL(userTTL)}`) : "❌ Inactive",
            inline: true
          },
          {
            name: "🏢 Guild Premium",
            value: guildValue ? (guildValue === "perm" ? "♾️ Lifetime" : `Active\n${formatTTL(guildTTL)}`) : "❌ Inactive",
            inline: true
          }
        )
        .setFooter({ text: "Use /redeem <code> to activate premium." })
        .setTimestamp();

      // Debug info for dev
      if (userId === DEV_ID) {
        embed.addFields({
          name: "🔧 Debug (DEV only)",
          value: `User raw: \`${userValue || 'null'}\` (TTL: ${userTTL}s)\nGuild raw: \`${guildValue || 'null'}\` (TTL: ${guildTTL}s)`,
          inline: false
        });
      }

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

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
    .setDescription("💎 Premium Dashboard"),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

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
};

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const e = require("../emojis.js");

function formatTTL(ttlSeconds) {
  if (ttlSeconds === -1) return "♾️ **Permanent (Lifetime Access)**";
  if (ttlSeconds <= 0) return "❌ **Inactive**";

  const days = Math.floor(ttlSeconds / (24 * 60 * 60));
  const hours = Math.floor((ttlSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((ttlSeconds % (60 * 60)) / 60);

  let parts = [];
  if (days > 0) parts.push(`\`${days}d\``);
  if (hours > 0) parts.push(`\`${hours}h\``);
  if (minutes > 0) parts.push(`\`${minutes}m\``);
  
  return `⏳ ${parts.join(" ")} remaining`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("💎 View the activation time remaining on your user and server premium licenses."),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    const userValue = await redis.get(`premium:user:${userId}`);
    const userTTL = userValue === "perm" ? -1 : await redis.ttl(`premium:user:${userId}`);

    const guildValue = await redis.get(`premium:guild:${guildId}`);
    const guildTTL = guildValue === "perm" ? -1 : await redis.ttl(`premium:guild:${guildId}`);

    const statusEmbed = new EmbedBuilder()
      .setColor("#2B2D31")
      .setAuthor({ name: "System Premium Verification Ledger", iconURL: interaction.user.displayAvatarURL() })
      .setDescription("Live network data status for subscriptions associated with this workspace context:")
      .addFields(
        { 
          name: `👤 Personal Account (${interaction.user.username})`, 
          value: userValue ? `${e.premium || "💎"} **Active Premium Tier**\n${formatTTL(userTTL)}` : "❌ No active subscription layer.", 
          inline: false 
        },
        { 
          name: `🏢 Guild Server (${interaction.guild.name})`, 
          value: guildValue ? `${e.premium || "💎"} **Active Server Premium**\n${formatTTL(guildTTL)}` : "❌ Server running on Standard allocation layer.", 
          inline: false 
        }
      )
      .setFooter({ text: "To purchase or extend licenses, contact the bot manager." })
      .setTimestamp();

    return interaction.reply({ embeds: [statusEmbed] });
  }
};

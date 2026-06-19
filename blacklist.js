// blacklist.js – Blacklist check and embed builder
const { EmbedBuilder } = require("discord.js");

async function checkBlacklist(redis, userId, guildId) {
  // Check user blacklist
  const userData = await redis.get(`blacklist:user:${userId}`);
  if (userData) {
    const data = JSON.parse(userData);
    if (data.expiresAt && Date.now() > data.expiresAt) {
      await redis.del(`blacklist:user:${userId}`);
      return null;
    }
    return { type: 'user', data };
  }

  // Check guild blacklist
  const guildData = await redis.get(`blacklist:guild:${guildId}`);
  if (guildData) {
    const data = JSON.parse(guildData);
    if (data.expiresAt && Date.now() > data.expiresAt) {
      await redis.del(`blacklist:guild:${guildId}`);
      return null;
    }
    return { type: 'guild', data };
  }

  return null;
}

function buildBlacklistEmbed(data, type) {
  const isPermanent = !data.expiresAt;
  const expiresText = isPermanent ? 'Permanent' : `<t:${Math.floor(data.expiresAt / 1000)}:R>`;

  return new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("🚫 Bot Blacklist Notice")
    .setDescription(`You have been banned/blacklisted from using this bot.`)
    .addFields(
      { name: "Reason", value: data.reason || "No reason provided.", inline: false },
      { name: "Expires", value: expiresText, inline: true },
      { name: "Type", value: type === 'user' ? 'User' : 'Server', inline: true }
    )
    .setFooter({ text: "If you believe this blacklist was issued incorrectly and it is not permanent, feel free to contact our Support Team for assistance. Please note: If this is a permanent blacklist, neither the Support Team nor server administrators can remove or appeal this restriction." })
    .setTimestamp();
}

module.exports = { checkBlacklist, buildBlacklistEmbed };

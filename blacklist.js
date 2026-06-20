// blacklist.js – Main bot (with logging)
const { EmbedBuilder } = require("discord.js");

async function checkBlacklist(redis, userId, guildId) {
  console.log(`[BLACKLIST] Checking user ${userId} in guild ${guildId}`);

  // Check guild blacklist
  const guildKey = `blacklist:guild:${guildId}`;
  const guildData = await redis.get(guildKey);
  if (guildData) {
    console.log(`[BLACKLIST] Guild blacklist found for ${guildId}`);
    try {
      const data = JSON.parse(guildData);
      if (data.expiresAt && Date.now() > data.expiresAt) {
        await redis.del(guildKey);
        console.log(`[BLACKLIST] Guild blacklist expired, removed.`);
        return null;
      }
      return { type: 'guild', data };
    } catch (e) {
      console.error(`[BLACKLIST] Error parsing guild blacklist:`, e);
      await redis.del(guildKey);
      return null;
    }
  }

  // Check user blacklist
  const userKey = `blacklist:user:${userId}`;
  const userData = await redis.get(userKey);
  if (userData) {
    console.log(`[BLACKLIST] User blacklist found for ${userId}`);
    try {
      const data = JSON.parse(userData);
      if (data.expiresAt && Date.now() > data.expiresAt) {
        await redis.del(userKey);
        console.log(`[BLACKLIST] User blacklist expired, removed.`);
        return null;
      }
      return { type: 'user', data };
    } catch (e) {
      console.error(`[BLACKLIST] Error parsing user blacklist:`, e);
      await redis.del(userKey);
      return null;
    }
  }

  console.log(`[BLACKLIST] No blacklist found for user ${userId} or guild ${guildId}`);
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

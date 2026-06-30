// blacklist.js – Main bot (with logging)
const { EmbedBuilder } = require("discord.js");

async function checkBlacklist(db, userId, guildId) {
  console.log(`[BLACKLIST] Checking user ${userId} in guild ${guildId}`);

  // Check guild blacklist
  const guildKey = `blacklist:guild:${guildId}`;
  const guildData = await db.get(guildKey);
  if (guildData) {
    console.log(`[BLACKLIST] Guild blacklist found for ${guildId}`);
    if (guildData.expiresAt && Date.now() > guildData.expiresAt) {
      await db.del(guildKey);
      console.log(`[BLACKLIST] Guild blacklist expired, removed.`);
      return null;
    }
    return { type: 'guild', data: guildData };
  }

  // Check user blacklist
  const userKey = `blacklist:user:${userId}`;
  const userData = await db.get(userKey);
  if (userData) {
    console.log(`[BLACKLIST] User blacklist found for ${userId}`);
    if (userData.expiresAt && Date.now() > userData.expiresAt) {
      await db.del(userKey);
      console.log(`[BLACKLIST] User blacklist expired, removed.`);
      return null;
    }
    return { type: 'user', data: userData };
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

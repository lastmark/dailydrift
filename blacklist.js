// blacklist.js – Shared between main and helper bots
const { EmbedBuilder } = require("discord.js");

/**
 * Check if a user or guild is blacklisted
 * @param {Redis} redis - Redis client
 * @param {string} userId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<{type: 'user'|'guild', data: Object}|null>}
 */
async function checkBlacklist(redis, userId, guildId) {
  // Check guild blacklist first (server-wide block)
  const guildKey = `blacklist:guild:${guildId}`;
  const guildData = await redis.get(guildKey);
  if (guildData) {
    try {
      const data = JSON.parse(guildData);
      // Check expiry
      if (data.expiresAt && Date.now() > data.expiresAt) {
        await redis.del(guildKey);
        return null;
      }
      return { type: 'guild', data };
    } catch (e) {
      // If data is corrupt, delete it
      await redis.del(guildKey);
      return null;
    }
  }

  // Check user blacklist
  const userKey = `blacklist:user:${userId}`;
  const userData = await redis.get(userKey);
  if (userData) {
    try {
      const data = JSON.parse(userData);
      if (data.expiresAt && Date.now() > data.expiresAt) {
        await redis.del(userKey);
        return null;
      }
      return { type: 'user', data };
    } catch (e) {
      await redis.del(userKey);
      return null;
    }
  }

  return null;
}

/**
 * Build the blacklist embed response
 * @param {Object} data - Blacklist data (reason, expiresAt)
 * @param {string} type - 'user' or 'guild'
 * @returns {EmbedBuilder}
 */
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

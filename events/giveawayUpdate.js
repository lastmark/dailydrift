// events/giveawayUpdate.js – Periodic update for all giveaways
const { Events } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client, redis) {
    // Update all active giveaways every minute
    setInterval(async () => {
      const keys = await redis.keys('giveaway:*');
      for (const key of keys) {
        const data = await redis.hgetall(key);
        if (!data || data.ended === 'true') continue;
        // Check if giveaway is still active
        if (data.endTime <= Date.now()) continue;
        // Fetch message
        const [guildId, channelId, msgId] = key.split(':').slice(1);
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        const channel = guild.channels.cache.get(channelId);
        if (!channel) continue;
        let message;
        try {
          message = await channel.messages.fetch(msgId);
        } catch {
          continue;
        }
        // Update embed
        const { updateGiveawayEmbed } = require('../commands/giveaway.js');
        await updateGiveawayEmbed(message, key, redis);
      }
    }, 60000); // every minute
  }
};

// events/giveawayUpdate.js – uses keys and hGetAll
const { Events } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client, redis) {
    setInterval(async () => {
      try {
        const keys = await redis.keys('giveaway:*');
        for (const key of keys) {
          const data = await redis.hGetAll(key);
          if (!data || data.ended === 'true') continue;
          if (data.endTime <= Date.now()) continue;
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
          const { updateGiveawayEmbed } = require('../commands/giveaway.js');
          await updateGiveawayEmbed(message, key, redis);
        }
      } catch (error) {
        console.error('Giveaway update cron error:', error);
      }
    }, 60000);
  }
};

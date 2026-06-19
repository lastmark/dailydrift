// events/giveawayEnd.js – fixed Redis zRange method
const { Events } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client, redis) {
    setInterval(async () => {
      try {
        const now = Date.now();
        // Use zRange with BYSCORE (v4 syntax)
        const ending = await redis.zRange('giveaway:ending', 0, now, { BYSCORE: true });
        for (const key of ending) {
          const data = await redis.hGetAll(key);
          if (!data || data.ended === 'true') {
            await redis.zRem('giveaway:ending', key);
            continue;
          }
          const [guildId, channelId, msgId] = key.split(':').slice(1);
          const guild = client.guilds.cache.get(guildId);
          if (!guild) continue;
          const channel = guild.channels.cache.get(channelId);
          if (!channel) continue;
          let message;
          try {
            message = await channel.messages.fetch(msgId);
          } catch {
            await redis.hSet(key, 'ended', 'true');
            await redis.zRem('giveaway:ending', key);
            continue;
          }
          const { endGiveaway } = require('../commands/giveaway.js');
          await endGiveaway(key, data, message, client, redis);
          await redis.zRem('giveaway:ending', key);
        }
      } catch (error) {
        console.error('Giveaway cron error:', error);
      }
    }, 60000);
  }
};

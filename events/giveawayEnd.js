// events/giveawayEnd.js – Auto-ends giveaways when time expires
const { Events } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client, redis) {
    setInterval(async () => {
      const now = Date.now();
      const ending = await redis.zrangebyscore('giveaway:ending', 0, now);
      for (const key of ending) {
        const data = await redis.hgetall(key);
        if (!data || data.ended === 'true') {
          await redis.zrem('giveaway:ending', key);
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
          await redis.hset(key, 'ended', 'true');
          await redis.zrem('giveaway:ending', key);
          continue;
        }
        const { endGiveaway } = require('../commands/giveaway.js');
        await endGiveaway(key, data, message, client, redis);
        await redis.zrem('giveaway:ending', key);
      }
    }, 60000); // every minute
  }
};

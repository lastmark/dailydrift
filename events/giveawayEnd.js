// events/giveawayEnd.js – Auto-ends giveaways (fixed Redis methods)
const { Events } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client, redis) {
    setInterval(async () => {
      const now = Date.now();
      // Use zRangeByScore (v4 syntax)
      const ending = await redis.zRangeByScore('giveaway:ending', 0, now);
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
    }, 60000);
  }
};

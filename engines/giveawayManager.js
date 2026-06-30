// /app/engines/giveawayManager.js
const { EmbedBuilder } = require("discord.js");

function initGiveawayEngine(client, redis) {
  setInterval(async () => {
    try {
      const keys = await redis.keys("giveaway:*");
      if (!keys || keys.length === 0) return;

      for (const key of keys) {
        const data = await redis.hgetall(key);
        if (!data || data.ended === "true") continue;

        const now = Date.now();
        const endClock = parseInt(data.endsAt);

        if (now >= endClock) {
          await redis.hset(key, "ended", "true");

          const channel = await client.channels.fetch(data.channelId).catch(() => null);
          if (!channel) continue;

          const message = await channel.messages.fetch(data.messageId).catch(() => null);
          const registryKey = `giveaway:entries:${data.messageId}`;
          const entriesPool = await redis.smembers(registryKey);

          if (!entriesPool || entriesPool.length === 0) {
            if (message) {
              const finishedEmbed = EmbedBuilder.from(message.embeds[0])
                .setColor("#111111")
                .setTitle(`🎁 GIVEAWAY ENDED: ${data.prize.toUpperCase()}`)
                .setDescription(`**GIVEAWAY CANCELLED**\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n• Ended with zero entries. No winners could be selected.`);
              await message.edit({ embeds: [finishedEmbed], components: [] }).catch(() => {});
            }
            channel.send(`⚠️ **Giveaway Ended:** \`${data.prize}\` expired with no active entries.`);
            continue;
          }

          const randomized = entriesPool.sort(() => 0.5 - Math.random());
          const selectedWinners = randomized.slice(0, parseInt(data.winners));
          const tags = selectedWinners.map(id => `<@${id}>`).join(", ");

          if (message) {
            const finishedEmbed = EmbedBuilder.from(message.embeds[0])
              .setColor("#111111")
              .setTitle(`🎁 GIVEAWAY ENDED`)
              .setDescription(
                `**GIVEAWAY CONCLUDED**\n` +
                `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
                `• **Prize:** \`${data.prize.toUpperCase()}\`\n` +
                `• **Winners:** ${tags}\n\n` +
                `*Congratulations to the winners!*`
              )
              .setFooter({ text: `CONCLUDED • TOTAL ENTRIES: ${entriesPool.length}` });

            await message.edit({ embeds: [finishedEmbed], components: [] }).catch(() => {});
          }

          channel.send(`✨ **GIVEAWAY CONCLUDED**\n• **Winners:** ${tags}\n• **Prize:** \`${data.prize}\``);
        }
      }
    } catch (err) {
      console.error("Giveaway engine loop error:", err);
    }
  }, 10000); 
}

module.exports = { initGiveawayEngine };

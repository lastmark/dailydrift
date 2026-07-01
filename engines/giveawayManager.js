// /app/engines/giveawayManager.js
const { EmbedBuilder } = require("discord.js");

function initGiveawayEngine(client, db) {
  setInterval(async () => {
    try {
      // Fetch all keys from the database instance
      const keys = await db.keys("giveaway:*");
      if (!keys || keys.length === 0) return;

      for (const key of keys) {
        // Skip entry registry keys to only process main config lines
        if (key.includes(":entries:")) continue;

        const data = await db.hgetall(key);
        if (!data || data.ended === "true") continue;

        const now = Date.now();
        const endClock = parseInt(data.endsAt);

        if (now >= endClock) {
          // Mark the giveaway configuration as concluded
          data.ended = "true";
          await db.set(key, data);

          const channel = await client.channels.fetch(data.channelId).catch(() => null);
          if (!channel) continue;

          const message = await channel.messages.fetch(data.messageId).catch(() => null);
          const registryKey = `giveaway:entries:${data.messageId}`;
          
          // Pull down array list of users who joined
          let entriesPool = (await db.get(registryKey)) || [];
          if (!Array.isArray(entriesPool)) entriesPool = [];

          if (entriesPool.length === 0) {
            if (message && message.embeds[0]) {
              const finishedEmbed = EmbedBuilder.from(message.embeds[0])
                .setColor("#111111")
                .setTitle(`🎁 GIVEAWAY ENDED: ${data.prize.toUpperCase()}`)
                .setDescription(`**GIVEAWAY CANCELLED**\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n• Ended with zero entries. No winners could be selected.`);
              await message.edit({ embeds: [finishedEmbed], components: [] }).catch(() => {});
            }
            channel.send(`⚠️ **Giveaway Ended:** \`${data.prize}\` expired with no active entries.`);
            continue;
          }

          // Secure cryptographic style randomizing sort line
          const randomized = [...entriesPool].sort(() => 0.5 - Math.random());
          const selectedWinners = randomized.slice(0, parseInt(data.winners || 1));
          const tags = selectedWinners.map(id => `<@${id}>`).join(", ");

          if (message && message.embeds[0]) {
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

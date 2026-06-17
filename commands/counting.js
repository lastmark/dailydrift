const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("counting")
    .setDescription("Counting system stats & leaderboard")
    .addSubcommand(s =>
      s.setName("stats").setDescription("View your full performance stats")
    )
    .addSubcommand(s =>
      s.setName("leaderboard").setDescription("Top players in counting")
    )
    .addSubcommand(s =>
      s.setName("shop").setDescription("Buy protection items")
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    // =========================
    // 📊 STATS
    // =========================
    if (sub === "stats") {
      const correct = Number(await redis.zscore(`counting:${guildId}:scores`, userId) || 0);
      const mistakes = Number(await redis.zscore(`counting:${guildId}:sabotages`, userId) || 0);
      const streak = Number(await redis.get(`counting:${guildId}:${userId}:streak`) || 0);
      const record = Number(await redis.get(`counting:${guildId}:highscore`) || 0);

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#5865F2")
            .setAuthor({
              name: `${interaction.user.username}'s Stats`,
              iconURL: interaction.user.displayAvatarURL()
            })
            .addFields(
              { name: "✅ Correct", value: `\`${correct}\``, inline: true },
              { name: "❌ Mistakes", value: `\`${mistakes}\``, inline: true },
              { name: "🔥 Streak", value: `\`${streak}\``, inline: true },
              { name: "🏆 Record", value: `\`${record}\``, inline: false }
            )
        ]
      });
    }

    // =========================
    // 🏆 LEADERBOARD
    // =========================
    if (sub === "leaderboard") {
      const data = await redis.zrevrange(
        `counting:${guildId}:scores`,
        0,
        9,
        "WITHSCORES"
      );

      let text = "";

      if (!data.length) {
        text = "No players yet.";
      } else {
        for (let i = 0, rank = 1; i < data.length; i += 2, rank++) {
          const user = data[i];
          const score = data[i + 1];

          text += `#${rank} <@${user}> — \`${score}\`\n`;
        }
      }

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FFD700")
            .setTitle("🏆 Leaderboard")
            .setDescription(text)
        ]
      });
    }

    // =========================
    // 🛒 SHOP (uses GLOBAL economy ONLY)
    // =========================
    if (sub === "shop") {
      const price = 200;
      const isDev = userId === "1303357369622990889";

      let coins = Number(await redis.get(`eco:${guildId}:${userId}:money`) || 0);

      if (!isDev && coins < price) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`❌ Not enough coins.\nNeed: ${price}\nYou have: ${coins}`)
          ]
        });
      }

      if (!isDev) {
        await redis.set(`eco:${guildId}:${userId}:money`, coins - price);
      }

      await redis.incr(`eco:${guildId}:${userId}:shield`);

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("🛡️ Shield Purchased")
            .setDescription("Protects your streak from one mistake")
        ]
      });
    }
  }
};

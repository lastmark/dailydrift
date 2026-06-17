const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const e = require("../emojis");

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("counting")
    .setDescription("Advanced counting system with stats, rewards, and leaderboard")
    .addSubcommand(s =>
      s.setName("balance").setDescription("View your coins and shields")
    )
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
    // 💰 BALANCE
    // =========================
    if (sub === "balance") {
      const coins = Number(await redis.get(`eco:${guildId}:${userId}:money`) || 0);
      const shields = Number(await redis.get(`eco:${guildId}:${userId}:shield`) || 0);
      const streak = Number(await redis.get(`counting:${guildId}:${userId}:streak`) || 0);

      let badge = "Newbie";
      if (streak >= 25) badge = "🔥 Elite Counter";
      else if (streak >= 10) badge = "⚡ Skilled Counter";
      else if (streak >= 5) badge = "📈 Rising Counter";

      const embed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setAuthor({
          name: `${interaction.user.username}'s Profile`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .setDescription("Your live counting economy profile.")
        .addFields(
          { name: "💰 Coins", value: `\`${coins}\``, inline: true },
          { name: "🛡️ Shields", value: `\`${shields}\``, inline: true },
          { name: "🔥 Streak", value: `\`${streak}\``, inline: true },
          { name: "🏅 Badge", value: badge, inline: false }
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // =========================
    // 📊 STATS
    // =========================
    if (sub === "stats") {
      const correct = Number(await redis.zscore(`counting:${guildId}:scores`, userId) || 0);
      const mistakes = Number(await redis.zscore(`counting:${guildId}:sabotages`, userId) || 0);
      const streak = Number(await redis.get(`counting:${guildId}:${userId}:streak`) || 0);
      const record = Number(await redis.get(`counting:${guildId}:highscore`) || 0);

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setAuthor({
          name: `${interaction.user.username}'s Analytics`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          { name: "✅ Correct Counts", value: `\`${correct}\``, inline: true },
          { name: "❌ Mistakes", value: `\`${mistakes}\``, inline: true },
          { name: "🔥 Current Streak", value: `\`${streak}\``, inline: true },
          { name: "🏆 Server Record", value: `\`${record}\``, inline: false }
        )
        .setFooter({ text: "Keep your streak alive to earn more rewards" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
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

      const record = Number(await redis.get(`counting:${guildId}:highscore`) || 0);

      let text = `🏆 **Server Record:** \`${record}\`\n\n`;

      if (!data.length) {
        text += "No players yet — start counting!";
      } else {
        for (let i = 0, rank = 1; i < data.length; i += 2, rank++) {
          const user = data[i];
          const score = data[i + 1];

          let medal = "";
          if (rank === 1) medal = "🥇";
          else if (rank === 2) medal = "🥈";
          else if (rank === 3) medal = "🥉";
          else medal = `#${rank}`;

          text += `${medal} <@${user}> — \`${score}\`\n`;
        }
      }

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("🏆 Counting Champions")
        .setDescription(text)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // =========================
    // 🛒 SHOP
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
              .setDescription(`❌ Not enough coins.\n\n💰 Required: \`${price}\`\n💰 You have: \`${coins}\``)
          ]
        });
      }

      if (!isDev) {
        await redis.set(`eco:${guildId}:${userId}:money`, coins - price);
      }

      await redis.incr(`eco:${guildId}:${userId}:shield`);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("🛡️ Shield Purchased")
        .setDescription(
          isDev
            ? "👑 Developer bypass active — free shield granted."
            : `You purchased a **Shield** for \`${price}\` coins.`
        )
        .addFields({
          name: "Effect",
          value: "Protects your streak from one mistake"
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  }
};

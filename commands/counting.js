const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const e = require("../emojis");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("counting")
    .setDescription("View counting game analytics, server rankings, balance, or access the item shop.")
    .addSubcommand(sub =>
      sub.setName("balance").setDescription("Check how many counting coins you currently have in your wallet.")
    )
    .addSubcommand(sub =>
      sub.setName("stats").setDescription("View your personal counting performance metrics.")
    )
    .addSubcommand(sub =>
      sub.setName("leaderboard").setDescription("Display the top 10 most accurate counters in the server.")
    )
    .addSubcommand(sub =>
      sub.setName("shop").setDescription("Purchase a Counting Shield to safeguard your server streaks.")
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    // ==========================================
    // SUBCOMMAND: WALLET BALANCE VIEW 💰
    // ==========================================
    if (sub === "balance") {
      const userBalance = await redis.get(`eco:${guildId}:${userId}:money`) || "0";
      const shields = await redis.get(`eco:${guildId}:${userId}:shield`) || "0";

      const balanceEmbed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setAuthor({ 
          name: `${interaction.user.username}'s Economy Profile`, 
          iconURL: interaction.user.displayAvatarURL() 
        })
        .setDescription(`Here is your current financial status inside the server structure. Maintain your counting streaks to earn more income!`)
        .addFields(
          { name: `${e.money || "🪙"} Account Balance`, value: `\`${userBalance}\` coins`, inline: true },
          { name: `${e.settings || "🛡️"} Inventory Shields`, value: `\`${shields}\` active`, inline: true }
        );

      return await interaction.editReply({ embeds: [balanceEmbed] });
    }

    // ==========================================
    // SUBCOMMAND: STATS VIEW
    // ==========================================
    if (sub === "stats") {
      const totalCounts = await redis.zscore(`counting:${guildId}:scores`, userId) || 0;
      const sabotages = await redis.zscore(`counting:${guildId}:sabotages`, userId) || 0;
      const shields = await redis.get(`eco:${guildId}:${userId}:shield`) || 0;
      const highScore = await redis.get(`counting:${guildId}:highscore`) || 0;

      const statsEmbed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setAuthor({ 
          name: `${interaction.user.username}'s Game Analytics`, 
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          { name: `${e.message || "✅"} Correct Counts`, value: `\`${totalCounts}\` entries`, inline: true },
          { name: `${e.error || "🚨"} Sabotages`, value: `\`${sabotages}\` resets caused`, inline: true },
          { name: `${e.settings || "🛡️"} Active Shields`, value: `\`${shields}\` remaining`, inline: true },
          { name: `${e.coin || "🏆"} Server Record`, value: `Streak: \`${highScore}\``, inline: false }
        );

      return await interaction.editReply({ embeds: [statsEmbed] });
    }

    // ==========================================
    // SUBCOMMAND: LEADERBOARD RUNNER
    // ==========================================
    if (sub === "leaderboard") {
      const topPlayers = await redis.zrevrange(`counting:${guildId}:scores`, 0, 9, "WITHSCORES");
      const highScore = await redis.get(`counting:${guildId}:highscore`) || "0";

      const lbEmbed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle(`${e.coin || "🏆"} Counting Championship Leaderboard`)
        .setDescription(`*Current Server Record Streak:* **${highScore}**\n\n`);

      if (topPlayers.length === 0) {
        lbEmbed.setDescription(lbEmbed.data.description + `*No data logs available yet. Go start counting!*`);
      } else {
        let listText = "";
        let rank = 1;
        for (let i = 0; i < topPlayers.length; i += 2) {
          const pUserId = topPlayers[i];
          const score = topPlayers[i + 1];
          listText += `**#${rank}** • <@${pUserId}> — \`${score}\` correct counts\n`;
          rank++;
        }
        lbEmbed.setDescription(lbEmbed.data.description + listText);
      }

      return await interaction.editReply({ embeds: [lbEmbed] });
    }

    // ==========================================
    // SUBCOMMAND: ECO SHIELD ITEM SHOP (👑 WITH DEV BYPASS)
    // ==========================================
    if (sub === "shop") {
      const SHIELD_PRICE = 200; 
      const isDeveloper = userId === "1303357369622990889"; // Put your ID string here!

      let userBalance = parseInt(await redis.get(`eco:${guildId}:${userId}:money`) || "0");
      
      if (!isDeveloper && userBalance < SHIELD_PRICE) {
        return await interaction.editReply({ 
          content: `${e.error || "❌"} **Insufficient funds!** A Counting Shield costs \`${SHIELD_PRICE}\` coins. You currently have \`${userBalance}\` ${e.money || "coins"}.` 
        });
      }

      if (!isDeveloper) {
        await redis.set(`eco:${guildId}:${userId}:money`, userBalance - SHIELD_PRICE);
      }

      await redis.incrby(`eco:${guildId}:${userId}:shield`, 1);

      const purchaseEmbed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle(`${e.money || "🛒"} Purchase Successful!`)
        .setDescription(
          isDeveloper 
            ? `👑 **Developer Bypass Activated!** You received **1 Counting Shield** completely free! \n└ *Your wallet balance was not touched.*`
            : `You successfully purchased **1 Counting Shield** for \`${SHIELD_PRICE}\` ${e.money || "coins"}!\n\n🛡️ This shield will automatically absorb your next mistake inside the counting channel to save your server's streak record.`
        );

      return await interaction.editReply({ embeds: [purchaseEmbed] });
    }
  }
};

// commands/mines.js – Replicating the compact layout from image.png
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const MAX_BET = 250_000;
const TOTAL_TILES = 9;               
const MIN_BOMBS = 1;
const MAX_BOMBS = 8;                
const HOUSE_EDGE_FACTOR = 0.98;     

module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("mines")
    .setDescription("Play Mines – pick tiles, dodge bombs, cash out!")
    .addStringOption(opt =>
      opt.setName("bet")
        .setDescription("Amount to bet, or 'all' (max 250,000)")
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("bombs")
        .setDescription(`Number of bombs (${MIN_BOMBS}-${MAX_BOMBS})`)
        .setRequired(true)
        .setMinValue(MIN_BOMBS)
        .setMaxValue(MAX_BOMBS)
    ),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const betRaw = interaction.options.getString("bet").toLowerCase();
    const bombs = interaction.options.getInteger("bombs");
    let bet;

    const balanceKey = `eco:${userId}:money`;
    const currentBal = Number(await redis.get(balanceKey) || 0);

    if (betRaw === "all") {
      bet = Math.min(currentBal, MAX_BET);
      if (bet <= 0) {
        return interaction.reply({ content: "❌ You have no coins.", flags: MessageFlags.Ephemeral });
      }
    } else {
      bet = parseInt(betRaw);
      if (isNaN(bet) || bet < 1) {
        return interaction.reply({ content: "❌ Please enter a number or 'all'.", flags: MessageFlags.Ephemeral });
      }
      if (bet > MAX_BET) bet = MAX_BET;
    }

    if (currentBal < bet) {
      return interaction.reply({
        content: `❌ You need **${bet.toLocaleString()}** coins, but you have **${currentBal.toLocaleString()}**.`,
        flags: MessageFlags.Ephemeral
      });
    }

    await redis.del(`mines:${userId}`);
    await redis.set(balanceKey, currentBal - bet);

    const bombPositions = [];
    while (bombPositions.length < bombs) {
      const pos = Math.floor(Math.random() * TOTAL_TILES) + 1;
      if (!bombPositions.includes(pos)) bombPositions.push(pos);
    }

    const gameState = {
      bet,
      bombs,
      bombPositions,
      safePicks: [],         
      currentMultiplier: 1.0,
      status: "playing"
    };
    await redis.set(`mines:${userId}`, JSON.stringify(gameState));

    function buildActiveRows(safePicks) {
      const rows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 1; c <= 3; c++) {
          const num = r * 3 + c;
          const isPicked = safePicks.includes(num);

          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`mines_tile_${num}`)
              .setEmoji(isPicked ? "💎" : "⬛")
              // Using Success (Green) for picked diamonds, Secondary (Grey) for hidden tiles like the picture
              .setStyle(isPicked ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setDisabled(isPicked)
          );
        }
        rows.push(row);
      }
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("mines_cashout")
            .setLabel("💵 Cash Out")
            .setStyle(ButtonStyle.Success)
            .setDisabled(safePicks.length === 0)
        )
      );
      return rows;
    }

    function buildRevealedRows(bombPositions, safePicks, hitTile = null) {
      const revealedRows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 1; c <= 3; c++) {
          const num = r * 3 + c;
          let emoji, style;

          if (num === hitTile) {
            emoji = "💥"; // Exploded tile (Red background)
            style = ButtonStyle.Danger;
          } else if (bombPositions.includes(num)) {
            emoji = "💣"; // Revealed bombs (Grey background)
            style = ButtonStyle.Secondary;
          } else if (safePicks.includes(num)) {
            emoji = "💎"; // Picked diamonds (Green background)
            style = ButtonStyle.Success;
          } else {
            emoji = "🔹"; // Safe but unpicked blue diamond
            style = ButtonStyle.Secondary;
          }

          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`mines_tile_${num}`)
              .setEmoji(emoji)
              .setStyle(style)
              .setDisabled(true)
          );
        }
        revealedRows.push(row);
      }
      revealedRows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("mines_cashout_disabled")
            .setLabel("💵 Cash Out")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        )
      );
      return revealedRows;
    }

    function getNewMultiplier(state) {
      const safe = state.safePicks.length;
      const fairNext = (TOTAL_TILES - safe) / (TOTAL_TILES - state.bombs - safe);
      return state.currentMultiplier * fairNext * HOUSE_EDGE_FACTOR;
    }

    // Matching the sleek, title-less description block layout of image.png
    // Using Crimson Red (#ED4245) for the sidebar as shown in your screenshot
    const gridEmbed = new EmbedBuilder()
      .setColor("#ED4245")
      .setDescription([
        `💥 <@${userId}> **touched a mine!**`, // Kept as base state header or placeholder
        ``,
        `**Bet:** \`${bet}\`    **Mines:** \`${bombs}\``,
        `**Cash Out:** \`0 (0.00x)\``,
        `**Next:** \`${bet}\` (\`1.00x\`)`,
        `—`.repeat(15)
      ].join('\n'));

    await interaction.deferReply();
    const message = await interaction.editReply({ embeds: [gridEmbed], components: buildActiveRows([]) });

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === userId &&
        (i.customId.startsWith("mines_tile_") || i.customId === "mines_cashout"),
      time: 300_000
    });

    collector.on("collect", async btnInteraction => {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) {
        await btnInteraction.update({ content: "⚠️ Game session expired.", embeds: [], components: [] });
        collector.stop();
        return;
      }
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      // ---- Cash out ----
      if (btnInteraction.customId === "mines_cashout") {
        if (state.safePicks.length === 0) {
          return btnInteraction.reply({ content: "❌ Pick at least one tile first.", flags: MessageFlags.Ephemeral });
        }

        const payout = Math.floor(state.bet * state.currentMultiplier);
        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);

        const embed = new EmbedBuilder()
          .setColor("#2ecc71")
          .setDescription([
            `🏆 <@${userId}> **cashed out safely!**`,
            ``,
            `**Bet:** \`${state.bet}\`    **Mines:** \`${state.bombs}\``,
            `**Cash Out:** \`${payout}\` (\`${state.currentMultiplier.toFixed(2)}x\`)`,
            `—`.repeat(15)
          ].join('\n'));

        await btnInteraction.update({ embeds: [embed], components: buildRevealedRows(state.bombPositions, state.safePicks) });
        await redis.del(`mines:${userId}`);
        return;
      }

      // ---- Tile pick ----
      const tileNum = parseInt(btnInteraction.customId.split("_")[2]);
      if (state.safePicks.includes(tileNum)) {
        return btnInteraction.reply({ content: "❌ Already revealed.", flags: MessageFlags.Ephemeral });
      }

      // Bomb hit
      if (state.bombPositions.includes(tileNum)) {
        state.status = "bust";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const profit = Math.floor(state.bet * state.currentMultiplier);

        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription([
            `💥 <@${userId}> **touched a mine!**`,
            ``,
            `**Bet:** \`${state.bet}\`    **Mines:** \`${state.bombs}\``,
            `~~**Cash Out:** ${profit} (${state.currentMultiplier.toFixed(2)}x)~~`,
            `**Next:** \`0\` (\`0.00x\`)`,
            `—`.repeat(15)
          ].join('\n'));

        await btnInteraction.update({ embeds: [embed], components: buildRevealedRows(state.bombPositions, state.safePicks, tileNum) });
        await redis.del(`mines:${userId}`);
        return;
      }

      // Safe pick
      state.safePicks.push(tileNum);
      state.currentMultiplier = getNewMultiplier(state);
      await redis.set(`mines:${userId}`, JSON.stringify(state));

      const nextMultiplier = state.currentMultiplier * ((TOTAL_TILES - state.safePicks.length) / (TOTAL_TILES - state.bombs - state.safePicks.length)) * HOUSE_EDGE_FACTOR;
      const profit = Math.floor(state.bet * state.currentMultiplier);
      const nextProfit = Math.floor(state.bet * nextMultiplier);

      const newEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription([
          `💎 <@${userId}> **is hunting for diamonds...**`,
          ``,
          `**Bet:** \`${state.bet}\`    **Mines:** \`${state.bombs}\``,
          `**Cash Out:** \`${profit}\` (\`${state.currentMultiplier.toFixed(2)}x\`)`,
          state.safePicks.length < (TOTAL_TILES - state.bombs) ? `**Next:** \`${nextProfit}\` (\`${nextMultiplier.toFixed(2)}x\`)` : `**Next:** \`Max Multiplier!\``,
          `—`.repeat(15)
        ].join('\n'));

      await btnInteraction.update({ embeds: [newEmbed], components: buildActiveRows(state.safePicks) });
    });

    // ---- Timeout Handling ----
    collector.on("end", async () => {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      if (state.safePicks.length === 0) {
        state.status = "bust";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        try {
          await message.edit({
            embeds: [
              new EmbedBuilder()
                .setColor("#ED4245")
                .setDescription(`⏰ **Time's up!** <@${userId}> didn't make any choices and lost their bet.`)
            ],
            components: buildRevealedRows(state.bombPositions, state.safePicks)
          });
        } catch (e) {}
      } else {
        const payout = Math.floor(state.bet * state.currentMultiplier);
        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);
        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        try {
          await message.edit({
            embeds: [
              new EmbedBuilder()
                .setColor("#2ecc71")
                .setDescription(`⏰ **Time's up!** Game automatically cashed out. <@${userId}> received \`${payout}\` coins.`)
            ],
            components: buildRevealedRows(state.bombPositions, state.safePicks)
          });
        } catch (e) {}
      }
      await redis.del(`mines:${userId}`);
    });
  }
};

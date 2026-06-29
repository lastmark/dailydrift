// commands/mines.js – Replicating image_2.png Layout Exactly Using Webhook Text Formatting
const {
  SlashCommandBuilder,
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
    .setDescription("Play Mines – click buttons directly to sweep tiles!")
    .addStringOption(opt =>
      opt.setName("bet")
        .setDescription("Amount to bet, or 'all'")
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

    // Parse Bet Currency
    if (betRaw === "all") {
      bet = Math.min(currentBal, MAX_BET);
      if (bet <= 0) return interaction.reply({ content: "❌ You have no coins.", flags: MessageFlags.Ephemeral });
    } else {
      bet = parseInt(betRaw);
      if (isNaN(bet) || bet < 1) return interaction.reply({ content: "❌ Invalid amount.", flags: MessageFlags.Ephemeral });
      if (bet > MAX_BET) bet = MAX_BET;
    }

    if (currentBal < bet) {
      return interaction.reply({
        content: `❌ Balance insufficient. Need **${bet.toLocaleString()}** coins.`,
        flags: MessageFlags.Ephemeral
      });
    }

    await redis.del(`mines:${userId}`);
    await redis.set(balanceKey, currentBal - bet);

    // Generate Mines Positions
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
      status: "playing",
      hitTile: null
    };
    await redis.set(`mines:${userId}`, JSON.stringify(gameState));

    // ---- Exact Layout Generation Helper to Match image_2.png ----
    function getMessageContent(state, user) {
      const profit = Math.floor(state.bet * state.currentMultiplier);
      const nextMultiplier = state.currentMultiplier * ((TOTAL_TILES - state.safePicks.length) / (TOTAL_TILES - state.bombs - state.safePicks.length)) * HOUSE_EDGE_FACTOR;
      const nextProfit = Math.floor(state.bet * nextMultiplier);

      if (state.status === "bust") {
        return [
          `💥 **<@${user}> touched a mine!**`,
          ``,
          `**Bet:** \`${state.bet}\`   **Mines:** \`${state.bombs}\``,
          `~~**Cash Out:** ${profit} (${state.currentMultiplier.toFixed(2)}x)~~`,
          `~~**Next:** 0 (0.00x)~~`,
          `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`
        ].join("\n");
      }

      if (state.status === "cashed_out") {
        return [
          `🏆 **<@${user}> cashed out safely!**`,
          ``,
          `**Bet:** \`${state.bet}\`   **Mines:** \`${state.bombs}\``,
          `**Cash Out:** \`${profit}\` (\`${state.currentMultiplier.toFixed(2)}x\`)`,
          `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`
        ].join("\n");
      }

      // Default Active Play Layout (Uses dark code blocks for grey highlights in image_2.png)
      return [
        `✨ **<@${user}> is playing Mines!**`,
        ``,
        `**Bet:** \`${state.bet}\`   **Mines:** \`${state.bombs}\``,
        `**Cash Out:** \`${profit} (${state.currentMultiplier.toFixed(2)}x)\``,
        state.safePicks.length < (TOTAL_TILES - state.bombs) ? `**Next:** \`${nextProfit} (${nextMultiplier.toFixed(2)}x)\`` : `**Next:** \`MAX!\``,
        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`
      ].join("\n");
    }

    // ---- Active 3x3 Interaction Layout Rows ----
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
              .setEmoji(isPicked ? "💎" : "⬛") // Green style button vs unselected dark tile
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

    // ---- Final State Revealed Board Rows ----
    function buildRevealedRows(bombPositions, safePicks, hitTile = null) {
      const revealedRows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 1; c <= 3; c++) {
          const num = r * 3 + c;
          let emoji, style;

          if (num === hitTile) {
            emoji = "💥"; 
            style = ButtonStyle.Danger;    // Red background block for hit mine
          } else if (bombPositions.includes(num)) {
            emoji = "💣"; 
            style = ButtonStyle.Secondary; // Grey background block for safe unrevealed mines
          } else {
            emoji = "💎"; 
            style = ButtonStyle.Success;   // Green background blocks for safe jewels
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

    await interaction.deferReply();
    const message = await interaction.editReply({
      content: getMessageContent(gameState, userId),
      components: buildActiveRows([])
    });

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === userId &&
        (i.customId.startsWith("mines_tile_") || i.customId === "mines_cashout"),
      time: 300_000
    });

    collector.on("collect", async btnInteraction => {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) {
        await btnInteraction.update({ content: "⚠️ Session expired.", components: [] });
        collector.stop();
        return;
      }
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      // Handle Safe Cashout Choice
      if (btnInteraction.customId === "mines_cashout") {
        const payout = Math.floor(state.bet * state.currentMultiplier);
        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);

        await btnInteraction.update({
          content: getMessageContent(state, userId),
          components: buildRevealedRows(state.bombPositions, state.safePicks)
        });
        await redis.del(`mines:${userId}`);
        return;
      }

      // Handle Active Tile Choice
      const tileNum = parseInt(btnInteraction.customId.split("_")[2]);

      // Failed Choice: Hit Bomb
      if (state.bombPositions.includes(tileNum)) {
        state.status = "bust";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        await btnInteraction.update({
          content: getMessageContent(state, userId),
          components: buildRevealedRows(state.bombPositions, state.safePicks, tileNum)
        });
        await redis.del(`mines:${userId}`);
        return;
      }

      // Successful Choice: Safe Diamond
      state.safePicks.push(tileNum);
      
      const safe = state.safePicks.length;
      const fairNext = (TOTAL_TILES - (safe - 1)) / (TOTAL_TILES - state.bombs - (safe - 1));
      state.currentMultiplier = state.currentMultiplier * fairNext * HOUSE_EDGE_FACTOR;

      // Max Win Auto Cashout Condition
      if (state.safePicks.length === (TOTAL_TILES - state.bombs)) {
        const payout = Math.floor(state.bet * state.currentMultiplier);
        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);

        await btnInteraction.update({
          content: getMessageContent(state, userId),
          components: buildRevealedRows(state.bombPositions, state.safePicks)
        });
        await redis.del(`mines:${userId}`);
        return;
      }

      await redis.set(`mines:${userId}`, JSON.stringify(state));
      await btnInteraction.update({
        content: getMessageContent(state, userId),
        components: buildActiveRows(state.safePicks)
      });
    });

    collector.on("end", async () => {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      state.status = "bust";
      await redis.del(`mines:${userId}`);
      try {
        await message.edit({
          content: `⏰ **Time's up!** Game expired.`,
          components: buildRevealedRows(state.bombPositions, state.safePicks)
        });
      } catch (e) {}
    });
  }
};

// commands/mines.js – Native Components V2 Layout matching OwO perfectly
const {
  SlashCommandBuilder,
  MessageFlags
} = require("discord.js");

const MAX_BET = 250_000;
const TOTAL_TILES = 9;               
const MIN_BOMBS = 1;
const MAX_BOMBS = 8;                
const HOUSE_EDGE_FACTOR = 0.98;     

// Components V2 Message Flag (Crucial for nesting components inside panels)
const IS_COMPONENTS_V2 = 1 << 15;

module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("mines")
    .setDescription("Play Mines via integrated Components V2 containers!")
    .addStringOption(opt =>
      opt.setName("bet")
        .setDescription("Amount to bet, or 'all'")
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("bombs")
        .setDescription("Number of bombs (1-8)")
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

    // ---- Helper: Build V2 High-Level Unified Layout Payload ----
    function buildV2Payload(state) {
      const profit = Math.floor(state.bet * state.currentMultiplier);
      const nextMultiplier = state.currentMultiplier * ((TOTAL_TILES - state.safePicks.length) / (TOTAL_TILES - state.bombs - state.safePicks.length)) * HOUSE_EDGE_FACTOR;
      const nextProfit = Math.floor(state.bet * nextMultiplier);

      // 1. Text display heading block inside the box container
      let statusText = `✨ **<@${userId}> is playing Mines!**\n\n`;
      if (state.status === "bust") {
        statusText = `💥 **<@${userId}> touched a mine!**\n\n`;
      } else if (state.status === "cashed_out") {
        statusText = `🏆 **<@${userId}> cashed out safely!**\n\n`;
      }

      const statsContent = [
        statusText,
        `**Bet:** \`${state.bet}\`   **Mines:** \`${state.bombs}\``,
        state.status === "bust" ? `~~**Cash Out:** ${profit} (${state.currentMultiplier.toFixed(2)}x)~~` : `**Cash Out:** \`${profit} (${state.currentMultiplier.toFixed(2)}x)\``,
        state.status === "bust" ? `~~**Next:** 0 (0.00x)~~` : (state.safePicks.length < (TOTAL_TILES - state.bombs) ? `**Next:** \`${nextProfit} (${nextMultiplier.toFixed(2)}x)\`` : `**Next:** \`MAX!\``)
      ].join("\n");

      // 2. Generate Grid Matrix Children
      const gridRows = [];
      for (let r = 0; r < 3; r++) {
        const rowComponents = [];
        for (let c = 1; c <= 3; c++) {
          const num = r * 3 + c;
          const isPicked = state.safePicks.includes(num);
          
          let emoji = "⬛";
          let style = 2; // Secondary (Grey)
          let disabled = state.status !== "playing";

          if (state.status === "playing") {
            if (isPicked) {
              emoji = "💎";
              style = 3; // Success (Green)
              disabled = true;
            }
          } else {
            disabled = true;
            if (num === state.hitTile) {
              emoji = "💥";
              style = 4; // Danger (Red)
            } else if (state.bombPositions.includes(num)) {
              emoji = "💣";
              style = 2;
            } else {
              emoji = "💎";
              style = 3;
            }
          }

          rowComponents.push({
            type: 2, // Button component type
            custom_id: `mines_tile_${num}`,
            style: style,
            emoji: { name: emoji },
            disabled: disabled
          });
        }
        gridRows.push({
          type: 1, // Action Row component type
          components: rowComponents
        });
      }

      // 3. Footer Cash Out Action Component
      gridRows.push({
        type: 1,
        components: [{
          type: 2,
          custom_id: "mines_cashout",
          label: "Cash Out",
          style: 3, // Success Green
          disabled: state.status !== "playing" || state.safePicks.length === 0
        }]
      });

      // Assemble unified layout into container elements (V2 UI System)
      return {
        flags: IS_COMPONENTS_V2, 
        components: [
          {
            type: 1, // High level layout row
            components: [
              {
                type: 4, // Text Content component layout block
                text: statsContent
              }
            ]
          },
          {
            type: 1, 
            components: [
              {
                type: 5, // Container UI component block holding nested interaction rows
                components: gridRows
              }
            ]
          }
        ]
      };
    }

    // Initial deployment reply execution
    await interaction.deferReply();
    const payload = buildV2Payload(gameState);
    const message = await interaction.editReply(payload);

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

      // Handle Cashout Action Execution
      if (btnInteraction.customId === "mines_cashout") {
        const payout = Math.floor(state.bet * state.currentMultiplier);
        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);

        await btnInteraction.update(buildV2Payload(state));
        await redis.del(`mines:${userId}`);
        return;
      }

      // Handle Grid Selection Action Execution
      const tileNum = parseInt(btnInteraction.customId.split("_")[2]);

      if (state.bombPositions.includes(tileNum)) {
        state.status = "bust";
        state.hitTile = tileNum;
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        await btnInteraction.update(buildV2Payload(state));
        await redis.del(`mines:${userId}`);
        return;
      }

      state.safePicks.push(tileNum);
      
      const safe = state.safePicks.length;
      const fairNext = (TOTAL_TILES - (safe - 1)) / (TOTAL_TILES - state.bombs - (safe - 1));
      state.currentMultiplier = state.currentMultiplier * fairNext * HOUSE_EDGE_FACTOR;

      if (state.safePicks.length === (TOTAL_TILES - state.bombs)) {
        const payout = Math.floor(state.bet * state.currentMultiplier);
        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);

        await btnInteraction.update(buildV2Payload(state));
        await redis.del(`mines:${userId}`);
        return;
      }

      await redis.set(`mines:${userId}`, JSON.stringify(state));
      await btnInteraction.update(buildV2Payload(state));
    });

    collector.on("end", async () => {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      state.status = "bust";
      await redis.del(`mines:${userId}`);
      try {
        await message.edit(buildV2Payload(state));
      } catch (e) {}
    });
  }
};

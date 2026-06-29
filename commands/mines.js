// commands/mines.js – Realistic 5×5 Mines (dynamic multipliers, house edge)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const MAX_BET = 250_000;
const TOTAL_TILES = 25;              // 5×5 grid
const MIN_BOMBS = 1;
const MAX_BOMBS = 10;               // up to 10 mines
const HOUSE_EDGE_FACTOR = 0.98;     // 2% house edge per pick

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

    // ---- Parse bet ----
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

    // Check active game
    if (await redis.get(`mines:${userId}`)) {
      return interaction.reply({
        content: "❌ You already have an active Mines game.",
        flags: MessageFlags.Ephemeral
      });
    }

    // Deduct bet
    await redis.set(balanceKey, currentBal - bet);

    // Generate bomb positions (unique numbers 1‑25)
    const bombPositions = [];
    while (bombPositions.length < bombs) {
      const pos = Math.floor(Math.random() * TOTAL_TILES) + 1;
      if (!bombPositions.includes(pos)) bombPositions.push(pos);
    }

    const gameState = {
      bet,
      bombs,
      bombPositions,
      safePicks: [],         // tile numbers picked safely
      currentMultiplier: 1.0,
      status: "playing",
      gridMessageId: null,
      cashoutMessageId: null
    };
    await redis.set(`mines:${userId}`, JSON.stringify(gameState));

    // ---- Build 5×5 grid message ----
    const gridRows = [];
    for (let r = 0; r < 5; r++) {
      const row = new ActionRowBuilder();
      for (let c = 1; c <= 5; c++) {
        const num = r * 5 + c;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`mines_tile_${num}`)
            .setLabel(`${num}`)
            .setStyle(ButtonStyle.Primary)
        );
      }
      gridRows.push(row);
    }

    const gridEmbed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("💣 Mines (5×5)")
      .setDescription(
        `Bet: **${bet.toLocaleString()}** coins\n` +
        `Bombs: **${bombs}** / 25\n` +
        `Multiplier: **1.00×**\n\n` +
        `Pick a tile!`
      )
      .setFooter({ text: "Cash out anytime with the button below." });

    await interaction.deferReply();
    const gridMessage = await interaction.editReply({ embeds: [gridEmbed], components: gridRows });
    gameState.gridMessageId = gridMessage.id;

    // ---- Ephemeral cash‑out button ----
    const cashoutRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mines_cashout")
        .setLabel("Cash Out")
        .setStyle(ButtonStyle.Success)
    );
    const cashoutMessage = await interaction.followUp({
      content: "💰 Press **Cash Out** to lock your winnings.",
      components: [cashoutRow],
      flags: MessageFlags.Ephemeral
    });
    gameState.cashoutMessageId = cashoutMessage.id;
    await redis.set(`mines:${userId}`, JSON.stringify(gameState));

    // ---- Collectors ----
    // Grid collector (tile picks)
    const gridCollector = gridMessage.createMessageComponentCollector({
      filter: i => i.user.id === userId && i.customId.startsWith("mines_tile_"),
      time: 300_000
    });

    // Cash‑out collector
    const cashoutCollector = cashoutMessage.createMessageComponentCollector({
      filter: i => i.user.id === userId && i.customId === "mines_cashout",
      time: 300_000
    });

    // ---- Helper to compute new multiplier after a safe pick ----
    function getNewMultiplier(state) {
      const safe = state.safePicks.length;
      const fairNext = (TOTAL_TILES - safe) / (TOTAL_TILES - state.bombs - safe);
      return state.currentMultiplier * fairNext * HOUSE_EDGE_FACTOR;
    }

    // ---- Helper to reveal the full grid ----
    function buildRevealedRows(bombPositions, safePicks) {
      const rows = [];
      for (let r = 0; r < 5; r++) {
        const row = new ActionRowBuilder();
        for (let c = 1; c <= 5; c++) {
          const num = r * 5 + c;
          let label, style;
          if (bombPositions.includes(num)) {
            label = "💣";
            style = ButtonStyle.Danger;
          } else if (safePicks.includes(num)) {
            label = "✓";
            style = ButtonStyle.Success;
          } else {
            label = "○";
            style = ButtonStyle.Secondary;
          }
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`mines_tile_${num}`)
              .setLabel(label)
              .setStyle(style)
              .setDisabled(true)
          );
        }
        rows.push(row);
      }
      return rows;
    }

    // ---- Tile pick handler ----
    async function handleTilePick(btnInteraction) {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) {
        await btnInteraction.update({ content: "⚠️ Game session expired.", embeds: [], components: [] });
        gridCollector.stop();
        cashoutCollector.stop();
        return;
      }
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      const tileNum = parseInt(btnInteraction.customId.split("_")[2]);
      if (state.safePicks.includes(tileNum)) {
        return btnInteraction.reply({ content: "❌ Already revealed.", flags: MessageFlags.Ephemeral });
      }

      // Bomb hit
      if (state.bombPositions.includes(tileNum)) {
        state.status = "bust";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        gridCollector.stop();
        cashoutCollector.stop();

        const revealedRows = buildRevealedRows(state.bombPositions, state.safePicks);
        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("💥 Busted!")
          .setDescription(`You hit a **bomb** on tile ${tileNum}! You lost **${state.bet.toLocaleString()}** coins.`)
          .setFooter({ text: "Better luck next time!" });

        await btnInteraction.update({ embeds: [embed], components: revealedRows });
        // Disable cash‑out button in ephemeral message
        await cashoutMessage.edit({
          content: "Game over – you busted.",
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("mines_cashout_disabled")
                .setLabel("Cash Out")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
            )
          ]
        }).catch(() => {});
        await redis.del(`mines:${userId}`);
        return;
      }

      // Safe pick
      state.safePicks.push(tileNum);
      state.currentMultiplier = getNewMultiplier(state);
      await redis.set(`mines:${userId}`, JSON.stringify(state));

      // Update grid buttons (mark picked ones)
      const updatedRows = gridRows.map(row =>
        new ActionRowBuilder().addComponents(
          row.components.map(btn => {
            const num = parseInt(btn.data.custom_id.split("_")[2]);
            const newBtn = ButtonBuilder.from(btn);
            if (state.safePicks.includes(num)) {
              newBtn.setLabel("✓").setStyle(ButtonStyle.Success).setDisabled(true);
            }
            return newBtn;
          })
        )
      );

      const newEmbed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("💣 Mines (5×5)")
        .setDescription(
          `Bet: **${state.bet.toLocaleString()}** coins\n` +
          `Bombs: **${state.bombs}** / 25\n` +
          `Safe picks: **${state.safePicks.length}**\n` +
          `Multiplier: **${state.currentMultiplier.toFixed(2)}×**\n\n` +
          `Pick another tile or cash out!`
        );

      await btnInteraction.update({ embeds: [newEmbed], components: updatedRows });
    }

    // ---- Cash‑out handler ----
    async function handleCashout(btnInteraction) {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) {
        await btnInteraction.update({ content: "⚠️ Game expired.", embeds: [], components: [] });
        gridCollector.stop();
        cashoutCollector.stop();
        return;
      }
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;
      if (state.safePicks.length === 0) {
        return btnInteraction.reply({ content: "❌ Pick at least one tile first.", flags: MessageFlags.Ephemeral });
      }

      const payout = Math.floor(state.bet * state.currentMultiplier);
      state.status = "cashed_out";
      await redis.set(`mines:${userId}`, JSON.stringify(state));
      gridCollector.stop();
      cashoutCollector.stop();

      const newBal = Number(await redis.get(balanceKey) || 0) + payout;
      await redis.set(balanceKey, newBal);

      const revealedRows = buildRevealedRows(state.bombPositions, state.safePicks);
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("💰 Cashed Out!")
        .setDescription(
          `You cashed out after **${state.safePicks.length}** safe pick(s).\n` +
          `Multiplier: **${state.currentMultiplier.toFixed(2)}×**\n` +
          `You won **${payout.toLocaleString()}** coins!\n` +
          `Bet: ${state.bet.toLocaleString()} coins`
        )
        .setFooter({ text: "Well played!" });

      await btnInteraction.update({ embeds: [embed], components: revealedRows });
      // Update the ephemeral cash‑out message
      await cashoutMessage.edit({
        content: `✅ Cashed out at ${state.currentMultiplier.toFixed(2)}×.`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("mines_cashout_disabled")
              .setLabel("Cashed Out")
              .setStyle(ButtonStyle.Success)
              .setDisabled(true)
          )
        ]
      }).catch(() => {});
      await redis.del(`mines:${userId}`);
    }

    // ---- Timeout handler ----
    const timeoutHandler = async () => {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      // If no safe picks → lose
      if (state.safePicks.length === 0) {
        state.status = "bust";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        try {
          const revealedRows = buildRevealedRows(state.bombPositions, state.safePicks);
          await gridMessage.edit({
            embeds: [
              new EmbedBuilder()
                .setColor("#ED4245")
                .setTitle("⏰ Time's up!")
                .setDescription("You didn't pick any tile – you lost your bet.")
                .setFooter({ text: "Next time be faster!" })
            ],
            components: revealedRows
          });
          await cashoutMessage.edit({
            content: "⏰ Game expired – you lost.",
            components: []
          }).catch(() => {});
        } catch (e) {}
      } else {
        // Auto cash‑out
        const payout = Math.floor(state.bet * state.currentMultiplier);
        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);
        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        try {
          const revealedRows = buildRevealedRows(state.bombPositions, state.safePicks);
          await gridMessage.edit({
            embeds: [
              new EmbedBuilder()
                .setColor("#57F287")
                .setTitle("⏰ Time's up – Auto‑Cashed Out!")
                .setDescription(`You received **${payout.toLocaleString()}** coins.`)
                .setFooter({ text: "Game timed out." })
            ],
            components: revealedRows
          });
          await cashoutMessage.edit({
            content: `✅ Auto‑cashed out at ${state.currentMultiplier.toFixed(2)}×.`,
            components: []
          }).catch(() => {});
        } catch (e) {}
      }
      await redis.del(`mines:${userId}`);
    };

    gridCollector.on("collect", handleTilePick);
    cashoutCollector.on("collect", handleCashout);
    gridCollector.on("end", timeoutHandler);
    cashoutCollector.on("end", () => {}); // handled by gridCollector's end
  }
};

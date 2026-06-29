// commands/mines.js – OwO‑style Mines (3×3, 1‑8 bombs, one message)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const MAX_BET = 250_000;
const TOTAL_TILES = 9;               // 3×3
const MIN_BOMBS = 1;
const MAX_BOMBS = 8;                // OwO allows up to 8
const HOUSE_EDGE_FACTOR = 0.98;     // 2% per pick

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

    // Clear any stale game (solves “already active” bug)
    await redis.del(`mines:${userId}`);

    // Deduct bet
    await redis.set(balanceKey, currentBal - bet);

    // Generate bomb positions (unique numbers 1‑9)
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
      status: "playing"
    };
    await redis.set(`mines:${userId}`, JSON.stringify(gameState));

    // ---- Build 3×3 grid + cash‑out button on ONE message ----
    const rows = [];
    for (let r = 0; r < 3; r++) {
      const row = new ActionRowBuilder();
      for (let c = 1; c <= 3; c++) {
        const num = r * 3 + c;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`mines_tile_${num}`)
            .setLabel(`${num}`)
            .setStyle(ButtonStyle.Primary)
        );
      }
      rows.push(row);
    }
    // Cash‑out button row
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("mines_cashout")
          .setLabel("Cash Out")
          .setStyle(ButtonStyle.Success)
      )
    );

    const gridEmbed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("💣 Mines")
      .setDescription(
        `Bet: **${bet.toLocaleString()}** coins\n` +
        `Bombs: **${bombs}** / 9\n` +
        `Multiplier: **1.00×**\n\n` +
        `Pick a tile or cash out!`
      )
      .setFooter({ text: "Cash out anytime with the button below." });

    await interaction.deferReply();
    const message = await interaction.editReply({ embeds: [gridEmbed], components: rows });

    // ---- Single collector for both tile picks and cash out ----
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === userId &&
        (i.customId.startsWith("mines_tile_") || i.customId === "mines_cashout"),
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
      const revealedRows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 1; c <= 3; c++) {
          const num = r * 3 + c;
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
        revealedRows.push(row);
      }
      // Disable cash‑out button
      revealedRows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("mines_cashout_disabled")
            .setLabel("Cash Out")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        )
      );
      return revealedRows;
    }

    // ---- Event handler ----
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
          .setColor("#57F287")
          .setTitle("💰 Cashed Out!")
          .setDescription(
            `You cashed out after **${state.safePicks.length}** safe pick(s).\n` +
            `Multiplier: **${state.currentMultiplier.toFixed(2)}×**\n` +
            `You won **${payout.toLocaleString()}** coins!\n` +
            `Bet: ${state.bet.toLocaleString()} coins`
          )
          .setFooter({ text: "Well played!" });

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

        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("💥 Busted!")
          .setDescription(`You hit a **bomb** on tile ${tileNum}! You lost **${state.bet.toLocaleString()}** coins.`)
          .setFooter({ text: "Better luck next time!" });

        await btnInteraction.update({ embeds: [embed], components: buildRevealedRows(state.bombPositions, state.safePicks) });
        await redis.del(`mines:${userId}`);
        return;
      }

      // Safe pick
      state.safePicks.push(tileNum);
      state.currentMultiplier = getNewMultiplier(state);
      await redis.set(`mines:${userId}`, JSON.stringify(state));

      // Update grid buttons (mark picked ones)
      const updatedRows = rows.map(row =>
        new ActionRowBuilder().addComponents(
          row.components.map(btn => {
            const num = parseInt(btn.data.custom_id?.split("_")[2]);
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
        .setTitle("💣 Mines")
        .setDescription(
          `Bet: **${state.bet.toLocaleString()}** coins\n` +
          `Bombs: **${state.bombs}** / 9\n` +
          `Safe picks: **${state.safePicks.length}**\n` +
          `Multiplier: **${state.currentMultiplier.toFixed(2)}×**\n\n` +
          `Pick another tile or cash out!`
        );

      await btnInteraction.update({ embeds: [newEmbed], components: updatedRows });
    });

    // ---- Timeout ----
    collector.on("end", async () => {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      if (state.safePicks.length === 0) {
        state.status = "bust";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        try {
          const revealedRows = buildRevealedRows(state.bombPositions, state.safePicks);
          await message.edit({
            embeds: [
              new EmbedBuilder()
                .setColor("#ED4245")
                .setTitle("⏰ Time's up!")
                .setDescription("You didn't pick any tile – you lost your bet.")
                .setFooter({ text: "Next time be faster!" })
            ],
            components: revealedRows
          });
        } catch (e) {}
      } else {
        const payout = Math.floor(state.bet * state.currentMultiplier);
        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);
        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        try {
          const revealedRows = buildRevealedRows(state.bombPositions, state.safePicks);
          await message.edit({
            embeds: [
              new EmbedBuilder()
                .setColor("#57F287")
                .setTitle("⏰ Time's up – Auto‑Cashed Out!")
                .setDescription(`You received **${payout.toLocaleString()}** coins.`)
                .setFooter({ text: "Game timed out." })
            ],
            components: revealedRows
          });
        } catch (e) {}
      }
      await redis.del(`mines:${userId}`);
    });
  }
};

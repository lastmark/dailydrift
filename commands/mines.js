// commands/mines.js – Aesthetic OwO‑style Mines (3×3, 1‑8 bombs, one message)
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
const MAX_BOMBS = 8;                
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

    // Clear any stale game
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
      safePicks: [],         
      currentMultiplier: 1.0,
      status: "playing"
    };
    await redis.set(`mines:${userId}`, JSON.stringify(gameState));

    // ---- Helper to render active components grid ----
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
              .setStyle(isPicked ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setDisabled(isPicked)
          );
        }
        rows.push(row);
      }
      // Cash‑out button row
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

    // ---- Helper to reveal the full grid on Game Over ----
    function buildRevealedRows(bombPositions, safePicks, hitTile = null) {
      const revealedRows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 1; c <= 3; c++) {
          const num = r * 3 + c;
          let emoji, style;

          if (num === hitTile) {
            emoji = "💥";
            style = ButtonStyle.Danger;
          } else if (bombPositions.includes(num)) {
            emoji = "💣";
            style = ButtonStyle.Secondary;
          } else if (safePicks.includes(num)) {
            emoji = "💎";
            style = ButtonStyle.Success;
          } else {
            emoji = "🔹";
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

    // ---- Helper to compute new multiplier after a safe pick ----
    function getNewMultiplier(state) {
      const safe = state.safePicks.length;
      const fairNext = (TOTAL_TILES - safe) / (TOTAL_TILES - state.bombs - safe);
      return state.currentMultiplier * fairNext * HOUSE_EDGE_FACTOR;
    }

    // Initial embed build
    const gridEmbed = new EmbedBuilder()
      .setColor("#2b2d31")
      .setDescription([
        `\`💣\` **${interaction.user.username}'s ᴍɪɴᴇs ɢᴀᴍᴇ**`,
        `—`.repeat(18),
        `💵 **Wager:** \`${bet.toLocaleString()}\` 🪙`,
        `💣 **Total Mines:** \`${bombs}\``,
        `💰 **Current Value:** \`${bet.toLocaleString()}\` (1.00x)`,
        `—`.repeat(18),
        `Select a tile below to begin tracking diamonds!`
      ].join('\n'))
      .setFooter({ text: "Play carefully!" });

    await interaction.deferReply();
    const message = await interaction.editReply({ embeds: [gridEmbed], components: buildActiveRows([]) });

    // ---- Single collector for both tile picks and cash out ----
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === userId &&
        (i.customId.startsWith("mines_tile_") || i.customId === "mines_cashout"),
      time: 300_000
    });

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
          .setColor("#2ecc71")
          .setDescription([
            `\`🏆\` **${interaction.user.username} cashed out safely!**`,
            `—`.repeat(18),
            `💵 **Wager:** \`${state.bet.toLocaleString()}\` 🪙`,
            `✨ **Safe Picks:** \`${state.safePicks.length}\``,
            `📈 **Final Multiplier:** \`${state.currentMultiplier.toFixed(2)}x\``,
            `💰 **Total Payout:** \`${payout.toLocaleString()}\` 🪙`,
            `—`.repeat(18)
          ].join('\n'))
          .setFooter({ text: "Excellent choice." });

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
          .setColor("#e74c3c")
          .setDescription([
            `\`💥\` **${interaction.user.username} touched a mine!**`,
            `—`.repeat(18),
            `💵 **Wager Lost:** \`${state.bet.toLocaleString()}\` 🪙`,
            `✨ **Safe Picks Made:** \`${state.safePicks.length}\``,
            `❌ **Exploded On Tile:** \`${tileNum}\``,
            `—`.repeat(18)
          ].join('\n'))
          .setFooter({ text: "Better luck next time!" });

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
        .setColor("#2b2d31")
        .setDescription([
          `\`💎\` **${interaction.user.username}'s ᴍɪɴᴇs ɢᴀᴍᴇ**`,
          `—`.repeat(18),
          `💵 **Wager:** \`${state.bet.toLocaleString()}\` 🪙`,
          `💣 **Total Mines:** \`${state.bombs}\``,
          `💰 **Current Value:** \`${profit.toLocaleString()}\` (${state.currentMultiplier.toFixed(2)}x)`,
          state.safePicks.length < (TOTAL_TILES - state.bombs) ? `✨ **Next Tile:** \`${nextProfit.toLocaleString()}\` (${nextMultiplier.toFixed(2)}x)` : `✨ **Max Multiplier Reached!**`,
          `—`.repeat(18)
        ].join('\n'))
        .setFooter({ text: "Keep hunting or cash out safely!" });

      await btnInteraction.update({ embeds: [newEmbed], components: buildActiveRows(state.safePicks) });
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
                .setColor("#e74c3c")
                .setDescription(`⏰ **Time's up!** You didn't make any choices and lost your bet of \`${state.bet.toLocaleString()}\` coins.`)
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
                .setColor("#2ecc71")
                .setDescription(`⏰ **Time's up!** Game automatically cashed out. You received \`${payout.toLocaleString()}\` coins.`)
            ],
            components: revealedRows
          });
        } catch (e) {}
      }
      await redis.del(`mines:${userId}`);
    });
  }
};

// commands/mines.js – Mines game (full reveal on end, corrected)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const MAX_BET = 250_000;
const MULTIPLIERS = [1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 7.0, 10.0];
const GRID_SIZE = 9;   // 3×3

module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("mines")
    .setDescription("Play Mines – pick tiles and cash out before hitting the bomb!")
    .addStringOption(opt =>
      opt.setName("bet")
        .setDescription("Amount to bet, or 'all' (max 250,000)")
        .setRequired(true)
    ),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const betRaw = interaction.options.getString("bet").toLowerCase();
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
        content: "❌ You already have an active Mines game. Finish it first.",
        flags: MessageFlags.Ephemeral
      });
    }

    // Deduct bet
    await redis.set(balanceKey, currentBal - bet);

    // Generate mine position (1‑based, 1‑9)
    const minePos = Math.floor(Math.random() * GRID_SIZE) + 1;

    const gameState = {
      bet,
      minePos,
      picked: [],       // numbers already picked safely
      status: "playing",
    };
    await redis.set(`mines:${userId}`, JSON.stringify(gameState));

    // Build embed
    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("💣 Mines")
      .setDescription(
        `Bet: **${bet.toLocaleString()}** coins\n` +
        `Pick a tile (1‑9). One is a **bomb**!\n` +
        `Current multiplier: **1.00×**`
      )
      .setFooter({ text: "Choose wisely…" });

    // Build buttons (3×3 grid + cashout)
    const tileButtons = [];
    for (let i = 1; i <= GRID_SIZE; i++) {
      tileButtons.push(
        new ButtonBuilder()
          .setCustomId(`mines_tile_${i}`)
          .setLabel(`${i}`)
          .setStyle(ButtonStyle.Primary)
      );
    }
    const cashOutBtn = new ButtonBuilder()
      .setCustomId("mines_cashout")
      .setLabel("Cash Out")
      .setStyle(ButtonStyle.Success);

    const rows = [];
    for (let r = 0; r < 3; r++) {
      rows.push(new ActionRowBuilder().addComponents(tileButtons.slice(r * 3, r * 3 + 3)));
    }
    rows.push(new ActionRowBuilder().addComponents(cashOutBtn));

    await interaction.deferReply();
    const message = await interaction.editReply({ embeds: [embed], components: rows });

    // Collector
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === userId && (i.customId.startsWith("mines_tile_") || i.customId === "mines_cashout"),
      time: 300_000,
    });

    // Helper to generate the revealed grid after game ends
    const revealGrid = (minePos, picked) => {
      const buttons = [];
      for (let i = 1; i <= GRID_SIZE; i++) {
        let label, style;
        if (i === minePos) {
          label = "💣";
          style = ButtonStyle.Danger;
        } else if (picked.includes(i)) {
          label = "✓";
          style = ButtonStyle.Success;
        } else {
          label = "○";
          style = ButtonStyle.Secondary;
        }
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`mines_tile_${i}`)
            .setLabel(label)
            .setStyle(style)
            .setDisabled(true)
        );
      }
      // Cash out button disabled
      const cashOutDisabled = new ButtonBuilder()
        .setCustomId("mines_cashout")
        .setLabel("Cash Out")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      const resultRows = [];
      for (let r = 0; r < 3; r++) {
        resultRows.push(new ActionRowBuilder().addComponents(buttons.slice(r * 3, r * 3 + 3)));
      }
      resultRows.push(new ActionRowBuilder().addComponents(cashOutDisabled));
      return resultRows;
    };

    collector.on("collect", async (btnInteraction) => {
      if (btnInteraction.user.id !== userId) {
        return btnInteraction.reply({ content: "❌ This is not your game.", flags: MessageFlags.Ephemeral });
      }

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
        const numPicked = state.picked.length;
        if (numPicked === 0) {
          return btnInteraction.reply({ content: "❌ Pick at least one tile before cashing out.", flags: MessageFlags.Ephemeral });
        }
        const multiplier = MULTIPLIERS[numPicked - 1];
        const payout = Math.floor(bet * multiplier);

        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);

        const revealedRows = revealGrid(state.minePos, state.picked);

        const embed = EmbedBuilder.from(message.embeds[0])
          .setColor("#57F287")
          .setTitle("💰 Cashed Out!")
          .setDescription(
            `You cashed out after **${numPicked}** safe pick(s).\n` +
            `Multiplier: **${multiplier.toFixed(2)}×**\n` +
            `You won **${payout.toLocaleString()}** coins!\n` +
            `Bet: ${bet.toLocaleString()} coins`
          )
          .setFooter({ text: "Well played!" });

        await btnInteraction.update({ embeds: [embed], components: revealedRows });
        await redis.del(`mines:${userId}`);
        return;
      }

      // ---- Tile pick ----
      const tileNum = parseInt(btnInteraction.customId.split("_")[2]);
      if (isNaN(tileNum) || tileNum < 1 || tileNum > GRID_SIZE) return;

      if (state.picked.includes(tileNum)) {
        return btnInteraction.reply({ content: "❌ This tile is already revealed.", flags: MessageFlags.Ephemeral });
      }

      // Bomb!
      if (tileNum === state.minePos) {
        state.status = "bust";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const revealedRows = revealGrid(state.minePos, state.picked);

        const embed = EmbedBuilder.from(message.embeds[0])
          .setColor("#ED4245")
          .setTitle("💥 Busted!")
          .setDescription(
            `You hit the **bomb** on tile ${tileNum}!\n` +
            `You lost **${bet.toLocaleString()}** coins.`
          )
          .setFooter({ text: "Better luck next time!" });

        await btnInteraction.update({ embeds: [embed], components: revealedRows });
        await redis.del(`mines:${userId}`);
        return;
      }

      // Safe tile
      state.picked.push(tileNum);
      await redis.set(`mines:${userId}`, JSON.stringify(state));

      const numPicked = state.picked.length;
      const currentMult = MULTIPLIERS[numPicked - 1];
      const maxMult = MULTIPLIERS[MULTIPLIERS.length - 1];

      // Update buttons for current play (hide picked tiles with ✓)
      const updatedRows = rows.map(row =>
        new ActionRowBuilder().addComponents(
          row.components.map(btn => {
            const b = ButtonBuilder.from(btn);
            const btnNum = parseInt(btn.data.custom_id?.split("_")[2]);
            if (state.picked.includes(btnNum)) {
              b.setLabel("✓").setStyle(ButtonStyle.Success).setDisabled(true);
            }
            return b;
          })
        )
      );

      const embed = EmbedBuilder.from(message.embeds[0])
        .setColor("#FFD700")
        .setDescription(
          `Bet: **${bet.toLocaleString()}** coins\n` +
          `Safe tiles picked: **${numPicked}**\n` +
          `Current multiplier: **${currentMult.toFixed(2)}×**\n` +
          `Max possible: **${maxMult}×**\n\n` +
          `Choose another tile or **Cash Out**!`
        )
        .setFooter({ text: "The bomb is still hidden…" });

      await btnInteraction.update({ embeds: [embed], components: updatedRows });
    });

    collector.on("end", async () => {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.status === "playing") {
        const numPicked = state.picked.length;
        if (numPicked === 0) {
          // No picks – lose bet
          state.status = "bust";
          await redis.set(`mines:${userId}`, JSON.stringify(state));
          try {
            const revealedRows = revealGrid(state.minePos, state.picked);
            const embed = new EmbedBuilder()
              .setColor("#ED4245")
              .setTitle("⏰ Game Expired")
              .setDescription("You didn't pick any tile – you lost your bet.")
              .setFooter({ text: "Next time be faster!" });
            await message.edit({ embeds: [embed], components: revealedRows });
          } catch (e) {}
        } else {
          // Auto‑cashout with current multiplier
          const multiplier = MULTIPLIERS[numPicked - 1];
          const payout = Math.floor(bet * multiplier);
          const newBal = Number(await redis.get(balanceKey) || 0) + payout;
          await redis.set(balanceKey, newBal);
          state.status = "cashed_out";
          await redis.set(`mines:${userId}`, JSON.stringify(state));
          try {
            const revealedRows = revealGrid(state.minePos, state.picked);
            const embed = new EmbedBuilder()
              .setColor("#57F287")
              .setTitle("⏰ Time’s up – Auto‑Cashed Out!")
              .setDescription(`You received **${payout.toLocaleString()}** coins.`)
              .setFooter({ text: "Game timed out." });
            await message.edit({ embeds: [embed], components: revealedRows });
          } catch (e) {}
        }
        await redis.del(`mines:${userId}`);
      }
    });
  }
};

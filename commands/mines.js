// commands/mines.js – Mines game (safe, clean, full reveal)
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
const GRID_SIZE = 9;

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

    // Parse bet
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

    // Generate bomb position
    const bombPos = Math.floor(Math.random() * GRID_SIZE) + 1;
    const gameState = {
      bet,
      bombPos,
      picked: [],
      status: "playing"
    };
    await redis.set(`mines:${userId}`, JSON.stringify(gameState));

    // Initial embed
    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("💣 Mines")
      .setDescription(
        `Bet: **${bet.toLocaleString()}** coins\n` +
        `Pick a tile (1‑9) – one is a **bomb**!\n` +
        `Current multiplier: **1.00×**`
      )
      .setFooter({ text: "Choose wisely…" });

    // Build buttons
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
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("mines_cashout")
          .setLabel("Cash Out")
          .setStyle(ButtonStyle.Success)
      )
    );

    await interaction.deferReply();
    const message = await interaction.editReply({ embeds: [embed], components: rows });

    // Collector
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === userId &&
        (i.customId.startsWith("mines_tile_") || i.customId === "mines_cashout"),
      time: 300_000
    });

    // Reveal all tiles at game end
    function getRevealedRows(bombPos, picked) {
      const newRows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 1; c <= 3; c++) {
          const num = r * 3 + c;
          let label, style;
          if (num === bombPos) {
            label = "💣";
            style = ButtonStyle.Danger;
          } else if (picked.includes(num)) {
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
        newRows.push(row);
      }
      newRows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("mines_cashout")
            .setLabel("Cash Out")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        )
      );
      return newRows;
    }

    collector.on("collect", async btnInteraction => {
      if (btnInteraction.user.id !== userId) {
        return btnInteraction.reply({ content: "❌ Not your game.", flags: MessageFlags.Ephemeral });
      }

      const raw = await redis.get(`mines:${userId}`);
      if (!raw) {
        await btnInteraction.update({ content: "⚠️ Game expired.", embeds: [], components: [] });
        collector.stop();
        return;
      }
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      // Cash out
      if (btnInteraction.customId === "mines_cashout") {
        if (state.picked.length === 0) {
          return btnInteraction.reply({ content: "❌ Pick at least one tile first.", flags: MessageFlags.Ephemeral });
        }
        const mult = MULTIPLIERS[state.picked.length - 1];
        const payout = Math.floor(bet * mult);

        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);

        const embed = EmbedBuilder.from(message.embeds[0])
          .setColor("#57F287")
          .setTitle("💰 Cashed Out!")
          .setDescription(
            `You cashed out after **${state.picked.length}** safe pick(s).\n` +
            `Multiplier: **${mult.toFixed(2)}×**\n` +
            `You won **${payout.toLocaleString()}** coins!\n` +
            `Bet: ${bet.toLocaleString()} coins`
          )
          .setFooter({ text: "Well played!" });

        await btnInteraction.update({ embeds: [embed], components: getRevealedRows(state.bombPos, state.picked) });
        await redis.del(`mines:${userId}`);
        return;
      }

      // Tile pick
      const tileNum = parseInt(btnInteraction.customId.split("_")[2]);
      if (state.picked.includes(tileNum)) {
        return btnInteraction.reply({ content: "❌ Already revealed.", flags: MessageFlags.Ephemeral });
      }

      // Bomb hit
      if (tileNum === state.bombPos) {
        state.status = "bust";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const embed = EmbedBuilder.from(message.embeds[0])
          .setColor("#ED4245")
          .setTitle("💥 Busted!")
          .setDescription(`You hit the **bomb** on tile ${tileNum}! You lost **${bet.toLocaleString()}** coins.`)
          .setFooter({ text: "Better luck next time!" });

        await btnInteraction.update({ embeds: [embed], components: getRevealedRows(state.bombPos, state.picked) });
        await redis.del(`mines:${userId}`);
        return;
      }

      // Safe pick
      state.picked.push(tileNum);
      await redis.set(`mines:${userId}`, JSON.stringify(state));

      const numPicked = state.picked.length;
      const currentMult = MULTIPLIERS[numPicked - 1];
      const maxMult = MULTIPLIERS[MULTIPLIERS.length - 1];

      // Update buttons – mark picked ones
      const updatedRows = rows.map(row =>
        new ActionRowBuilder().addComponents(
          row.components.map(btn => {
            const btnNum = parseInt(btn.data.custom_id?.split("_")[2]);
            const newBtn = ButtonBuilder.from(btn);
            if (state.picked.includes(btnNum)) {
              newBtn.setLabel("✓").setStyle(ButtonStyle.Success).setDisabled(true);
            }
            return newBtn;
          })
        )
      );

      const embed = EmbedBuilder.from(message.embeds[0])
        .setColor("#FFD700")
        .setDescription(
          `Bet: **${bet.toLocaleString()}** coins\n` +
          `Safe picks: **${numPicked}**\n` +
          `Multiplier: **${currentMult.toFixed(2)}×**\n` +
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
          state.status = "bust";
          await redis.set(`mines:${userId}`, JSON.stringify(state));
          try {
            await message.edit({
              embeds: [
                new EmbedBuilder()
                  .setColor("#ED4245")
                  .setTitle("⏰ Game Expired")
                  .setDescription("You didn't pick any tile – you lost your bet.")
                  .setFooter({ text: "Next time be faster!" })
              ],
              components: getRevealedRows(state.bombPos, state.picked)
            });
          } catch (e) {}
        } else {
          const mult = MULTIPLIERS[numPicked - 1];
          const payout = Math.floor(bet * mult);
          const newBal = Number(await redis.get(balanceKey) || 0) + payout;
          await redis.set(balanceKey, newBal);
          state.status = "cashed_out";
          await redis.set(`mines:${userId}`, JSON.stringify(state));
          try {
            await message.edit({
              embeds: [
                new EmbedBuilder()
                  .setColor("#57F287")
                  .setTitle("⏰ Time’s up – Auto‑Cashed Out!")
                  .setDescription(`You received **${payout.toLocaleString()}** coins.`)
                  .setFooter({ text: "Game timed out." })
              ],
              components: getRevealedRows(state.bombPos, state.picked)
            });
          } catch (e) {}
        }
        await redis.del(`mines:${userId}`);
      }
    });
  }
};

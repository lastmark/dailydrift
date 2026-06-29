// commands/mines.js – Perfect Visual Match to OwO with Clickable Buttons
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const MAX_BET = 250_000;
const TOTAL_TILES = 9;               // 3×3 Grid
const MIN_BOMBS = 1;
const MAX_BOMBS = 8;                
const HOUSE_EDGE_FACTOR = 0.98;     

module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("mines")
    .setDescription("Play Mines – click tiles, dodge bombs, cash out!")
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

    // Clear stale session & deduct currency
    await redis.del(`mines:${userId}`);
    await redis.set(balanceKey, currentBal - bet);

    // Generate unique bomb positions (1-9)
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

    // ---- Helper: Active Interactive Grid Layout ----
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
              // Matches image.png unrevealed look vs green revealed diamonds
              .setEmoji(isPicked ? "💎" : "⬛") 
              .setStyle(isPicked ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setDisabled(isPicked)
          );
        }
        rows.push(row);
      }
      // Lower Action Row: Cash Out Button
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

    // ---- Helper: Full Reveal Grid on Game Over ----
    function buildRevealedRows(bombPositions, safePicks, hitTile = null) {
      const revealedRows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 1; c <= 3; c++) {
          const num = r * 3 + c;
          let emoji, style;

          if (num === hitTile) {
            emoji = "💥"; // Exploded tile (Red style background from image_2.png)
            style = ButtonStyle.Danger;
          } else if (bombPositions.includes(num)) {
            emoji = "💣"; // Hidden bombs revealed (Grey style background)
            style = ButtonStyle.Secondary;
          } else if (safePicks.includes(num)) {
            emoji = "💎"; // Successfully cleared diamond (Green style background)
            style = ButtonStyle.Success;
          } else {
            emoji = "💎"; // Safe unpicked diamonds (Green style background)
            style = ButtonStyle.Success;
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
      // Disabled Cash out state footer
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

    // Initial Live Setup
    const gridEmbed = new EmbedBuilder()
      .setColor("#da373c") // Matches the crisp red side panel in image_2.png
      .setDescription([
        `✨ **<@${userId}> is playing Mines!**`,
        ``,
        `**Bet:** \`${bet}\`   **Mines:** \`${bombs}\``,
        `**Cash Out:** \`0 (1.00x)\``,
        `**Next:** \`${bet}\` (\`1.00x\`)`,
        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯` // Divider line separator
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

      // ---- Process Cash out ----
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
          .setColor("#23a55a") // Smooth green success highlight stripe
          .setDescription([
            `🏆 **<@${userId}> cashed out safely!**`,
            ``,
            `**Bet:** \`${state.bet}\`   **Mines:** \`${state.bombs}\``,
            `**Cash Out:** \`${payout}\` (\`${state.currentMultiplier.toFixed(2)}x\`)`,
            `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`
          ].join('\n'));

        await btnInteraction.update({ embeds: [embed], components: buildRevealedRows(state.bombPositions, state.safePicks) });
        await redis.del(`mines:${userId}`);
        return;
      }

      // ---- Process Tile Interaction ----
      const tileNum = parseInt(btnInteraction.customId.split("_")[2]);
      if (state.safePicks.includes(tileNum)) {
        return btnInteraction.reply({ content: "❌ Already revealed.", flags: MessageFlags.Ephemeral });
      }

      // Bomb trigger condition (Matches image_2.png)
      if (state.bombPositions.includes(tileNum)) {
        state.status = "bust";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const profit = Math.floor(state.bet * state.currentMultiplier);

        const embed = new EmbedBuilder()
          .setColor("#da373c")
          .setDescription([
            `💥 **<@${userId}> touched a mine!**`,
            ``,
            `**Bet:** \`${state.bet}\`   **Mines:** \`${state.bombs}\``,
            `~~**Cash Out:** ${profit} (${state.currentMultiplier.toFixed(2)}x)~~`,
            `~~**Next:** 0 (0.00x)~~`,
            `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`
          ].join('\n'));

        await btnInteraction.update({ embeds: [embed], components: buildRevealedRows(state.bombPositions, state.safePicks, tileNum) });
        await redis.del(`mines:${userId}`);
        return;
      }

      // Safe selection recorded
      state.safePicks.push(tileNum);
      state.currentMultiplier = getNewMultiplier(state);
      await redis.set(`mines:${userId}`, JSON.stringify(state));

      const nextMultiplier = state.currentMultiplier * ((TOTAL_TILES - state.safePicks.length) / (TOTAL_TILES - state.bombs - state.safePicks.length)) * HOUSE_EDGE_FACTOR;
      const profit = Math.floor(state.bet * state.currentMultiplier);
      const nextProfit = Math.floor(state.bet * nextMultiplier);

      const newEmbed = new EmbedBuilder()
        .setColor("#da373c")
        .setDescription([
          `💎 **<@${userId}> is hunting for diamonds...**`,
          ``,
          `**Bet:** \`${state.bet}\`   **Mines:** \`${state.bombs}\``,
          `**Cash Out:** \`${profit}\` (\`${state.currentMultiplier.toFixed(2)}x\`)`,
          state.safePicks.length < (TOTAL_TILES - state.bombs) ? `**Next:** \`${nextProfit}\` (\`${nextMultiplier.toFixed(2)}x\`)` : `**Next:** \`Max Multiplier!\``,
          `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`
        ].join('\n'));

      await btnInteraction.update({ embeds: [newEmbed], components: buildActiveRows(state.safePicks) });
    });

    // ---- Component Timeout Management ----
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
                .setColor("#da373c")
                .setDescription(`⏰ **Time's up!** Game expired. Bet of \`${state.bet}\` coins lost.`)
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
                .setColor("#23a55a")
                .setDescription(`⏰ **Time's up!** Auto-cashed out safely. Received \`${payout}\` coins.`)
            ],
            components: buildRevealedRows(state.bombPositions, state.safePicks)
          });
        } catch (e) {}
      }
      await redis.del(`mines:${userId}`);
    });
  }
};

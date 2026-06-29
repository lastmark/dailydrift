// commands/mines.js – Complete Native Discord.js Components V2 Setup
const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder
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
    .setDescription("Play Mines inside a native V2 Container panel!")
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

    // ---- Helper: Build the Native V2 Component Structure ----
    function buildV2Layout(state) {
      const profit = Math.floor(state.bet * state.currentMultiplier);
      const nextMultiplier = state.currentMultiplier * ((TOTAL_TILES - state.safePicks.length) / (TOTAL_TILES - state.bombs - state.safePicks.length)) * HOUSE_EDGE_FACTOR;
      const nextProfit = Math.floor(state.bet * nextMultiplier);

      let statusLine = `✨ **<@${userId}> is playing Mines!**\n\n`;
      let accentColor = 0xda373c; // Red theme default

      if (state.status === "bust") {
        statusLine = `💥 **<@${userId}> touched a mine!**\n\n`;
        accentColor = 0xda373c; 
      } else if (state.status === "cashed_out") {
        statusLine = `🏆 **<@${userId}> cashed out safely!**\n\n`;
        accentColor = 0x23a55a; // Green theme panel on win
      }

      const infoText = [
        statusLine,
        `**Bet:** \`${state.bet}\`   **Mines:** \`${state.bombs}\``,
        state.status === "bust" ? `~~**Cash Out:** ${profit} (${state.currentMultiplier.toFixed(2)}x)~~` : `**Cash Out:** \`${profit} (${state.currentMultiplier.toFixed(2)}x)\``,
        state.status === "bust" ? `~~**Next:** 0 (0.00x)~~` : (state.safePicks.length < (TOTAL_TILES - state.bombs) ? `**Next:** \`${nextProfit} (${nextMultiplier.toFixed(2)}x)\`` : `**Next:** \`MAX!\``)
      ].join("\n");

      // Text block inside container
      const statsBlock = new TextDisplayBuilder().setContent(infoText);

      // Package everything cleanly inside a container object using specific V2 methods
      const containerPanel = new ContainerBuilder();
      containerPanel.setAccentColor(accentColor);
      
      // 1. Add the text block at the top
      containerPanel.addTextDisplayComponents(statsBlock);

      // 2. Build and add the 3x3 Button Array Layout
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 1; c <= 3; c++) {
          const num = r * 3 + c;
          const isPicked = state.safePicks.includes(num);
          
          let emoji = "⬛";
          let style = ButtonStyle.Secondary;
          let disabled = state.status !== "playing";

          if (state.status === "playing") {
            if (isPicked) {
              emoji = "💎";
              style = ButtonStyle.Success;
              disabled = true;
            }
          } else {
            disabled = true;
            if (num === state.hitTile) {
              emoji = "💥";
              style = ButtonStyle.Danger;
            } else if (state.bombPositions.includes(num)) {
              emoji = "💣";
              style = ButtonStyle.Secondary;
            } else {
              emoji = "💎";
              style = ButtonStyle.Success;
            }
          }

          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`mines_tile_${num}`)
              .setStyle(style)
              .setEmoji(emoji)
              .setDisabled(disabled)
          );
        }
        containerPanel.addActionRowComponents(row);
      }

      // 3. Add Footer Action Row for Cash Out Option
      const cashoutRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("mines_cashout")
          .setLabel("Cash Out")
          .setStyle(ButtonStyle.Success)
          .setDisabled(state.status !== "playing" || state.safePicks.length === 0)
      );
      containerPanel.addActionRowComponents(cashoutRow);

      return {
        components: [containerPanel],
        flags: MessageFlags.IsComponentsV2 // Lock the message directly to V2 processing
      };
    }

    await interaction.deferReply();
    const payload = buildV2Layout(gameState);
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

      if (btnInteraction.customId === "mines_cashout") {
        const payout = Math.floor(state.bet * state.currentMultiplier);
        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);

        await btnInteraction.update(buildV2Layout(state));
        await redis.del(`mines:${userId}`);
        return;
      }

      const tileNum = parseInt(btnInteraction.customId.split("_")[2]);

      if (state.bombPositions.includes(tileNum)) {
        state.status = "bust";
        state.hitTile = tileNum;
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        await btnInteraction.update(buildV2Layout(state));
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

        await btnInteraction.update(buildV2Layout(state));
        await redis.del(`mines:${userId}`);
        return;
      }

      await redis.set(`mines:${userId}`, JSON.stringify(state));
      await btnInteraction.update(buildV2Layout(state));
    });

    collector.on("end", async () => {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      state.status = "bust";
      await redis.del(`mines:${userId}`);
      try {
        await message.edit(buildV2Layout(state));
      } catch (e) {}
    });
  }
};

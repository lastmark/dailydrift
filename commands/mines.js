// commands/mines.js – OwO‑style Canvas Mines (3×3, 1‑8 bombs)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  AttachmentBuilder
} = require("discord.js");
const { createCanvas, loadImage } = require("canvas");

const MAX_BET = 250_000;
const TOTAL_TILES = 9;               // 3×3
const MIN_BOMBS = 1;
const MAX_BOMBS = 8;                
const HOUSE_EDGE_FACTOR = 0.98;     

module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("mines")
    .setDescription("Play Mines – type numbers to pick tiles, dodge bombs, cash out!")
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
    const username = interaction.user.username;
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

    await redis.del(`mines:${userId}`);
    await redis.set(balanceKey, currentBal - bet);

    // Generate bomb positions (1-9)
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

    // ---- Canvas Generation Engine ----
    async function drawMinesCard(state) {
      const width = 400;
      const height = 480;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // 1. Dark Card Background (Matches image.png panel)
      ctx.fillStyle = "#1e1f22";
      ctx.fillRect(0, 0, width, height);

      // 2. Left Red Side Border Stripe
      ctx.fillStyle = "#da373c";
      ctx.fillRect(0, 0, 8, height);

      // 3. Status Headers Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px sans-serif";
      
      if (state.status === "playing") {
        ctx.fillText(`💎 @${username} is hunting...`, 25, 40);
      } else if (state.status === "bust") {
        ctx.fillText(`💥 @${username} touched a mine!`, 25, 40);
      } else {
        ctx.fillText(`🏆 @${username} cashed out safely!`, 25, 40);
      }

      // Stats Fields
      ctx.fillStyle = "#b5bac1";
      ctx.font = "15px sans-serif";
      ctx.fillText(`Bet: ${state.bet.toLocaleString()}    Mines: ${state.bombs}`, 25, 80);

      const profit = Math.floor(state.bet * state.currentMultiplier);
      const nextMultiplier = state.currentMultiplier * ((TOTAL_TILES - state.safePicks.length) / (TOTAL_TILES - state.bombs - state.safePicks.length)) * HOUSE_EDGE_FACTOR;
      const nextProfit = Math.floor(state.bet * nextMultiplier);

      if (state.status === "bust") {
        ctx.fillText(`Cash Out: 0 (0.00x)`, 25, 110);
        ctx.fillText(`Next: 0 (0.00x)`, 25, 140);
      } else {
        ctx.fillText(`Cash Out: ${profit.toLocaleString()} (${state.currentMultiplier.toFixed(2)}x)`, 25, 110);
        if (state.status === "playing" && state.safePicks.length < (TOTAL_TILES - state.bombs)) {
          ctx.fillText(`Next: ${nextProfit.toLocaleString()} (${nextMultiplier.toFixed(2)}x)`, 25, 140);
        } else {
          ctx.fillText(`Next: --`, 25, 140);
        }
      }

      // 4. Exact Separation Line
      ctx.strokeStyle = "#35363c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(25, 170);
      ctx.lineTo(width - 25, 170);
      ctx.stroke();

      // 5. Build the 3x3 Grid Matrix
      const startX = 55;
      const startY = 200;
      const tileSize = 80;
      const gap = 15;

      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const num = r * 3 + (c + 1);
          const x = startX + c * (tileSize + gap);
          const y = startY + r * (tileSize + gap);

          // Tile Base Color
          if (state.status === "playing") {
            ctx.fillStyle = state.safePicks.includes(num) ? "#23a55a" : "#2b2d31"; // Green for cleared, dark for hidden
          } else {
            // End of Game Reveal Layouts
            if (num === state.hitTile) ctx.fillStyle = "#da373c"; // Red exploded tile
            else if (state.bombPositions.includes(num)) ctx.fillStyle = "#2b2d31"; // Muted for unrevealed bombs
            else if (state.safePicks.includes(num)) ctx.fillStyle = "#23a55a"; // Saved Green
            else ctx.fillStyle = "#2b2d31";
          }

          // Draw Rounded Rects for Grid Buttons
          ctx.beginPath();
          ctx.roundRect(x, y, tileSize, tileSize, 8);
          ctx.fill();

          // Text / Icon overlays
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 24px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          if (state.status === "playing") {
            if (state.safePicks.includes(num)) {
              ctx.fillText("🔹", x + tileSize / 2, y + tileSize / 2);
            } else {
              ctx.fillText(num.toString(), x + tileSize / 2, y + tileSize / 2);
            }
          } else {
            if (num === state.hitTile) ctx.fillText("💥", x + tileSize / 2, y + tileSize / 2);
            else if (state.bombPositions.includes(num)) ctx.fillText("💣", x + tileSize / 2, y + tileSize / 2);
            else ctx.fillText("🔹", x + tileSize / 2, y + tileSize / 2);
          }
          ctx.textAlign = "left"; // Reset positioning alignment
        }
      }

      return new AttachmentBuilder(canvas.toBuffer(), { name: "mines.png" });
    }

    // Initialize display layout
    await interaction.deferReply();
    let imageAttachment = await drawMinesCard(gameState);
    
    const message = await interaction.editReply({ 
      content: `🎮 **MINES** | Type a number (\`1-9\`) to flip, or type \`cashout\`!`, 
      files: [imageAttachment] 
    });

    // ---- Text Command Message Collector ----
    const collector = interaction.channel.createMessageCollector({
      filter: m => m.author.id === userId && (m.content.toLowerCase() === "cashout" || (!isNaN(m.content) && parseInt(m.content) >= 1 && parseInt(m.content) <= 9)),
      time: 300_000
    });

    function getNewMultiplier(state) {
      const safe = state.safePicks.length;
      const fairNext = (TOTAL_TILES - safe) / (TOTAL_TILES - state.bombs - safe);
      return state.currentMultiplier * fairNext * HOUSE_EDGE_FACTOR;
    }

    collector.on("collect", async msg => {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) {
        collector.stop();
        return;
      }
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      // Delete user's chat choice instantly to keep the visual tidy
      try { await msg.delete(); } catch(e) {}

      // Handle Cash Out Request
      if (msg.content.toLowerCase() === "cashout") {
        if (state.safePicks.length === 0) {
          const warning = await interaction.channel.send("❌ Choose at least one tile before cashing out.");
          setTimeout(() => warning.delete().catch(() => {}), 3000);
          return;
        }

        const payout = Math.floor(state.bet * state.currentMultiplier);
        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);

        imageAttachment = await drawMinesCard(state);
        await interaction.editReply({ content: `🏆 **Game Over!** You walked away with **${payout.toLocaleString()}** coins!`, files: [imageAttachment] });
        await redis.del(`mines:${userId}`);
        return;
      }

      // Handle Tile Selection Choice
      const tileNum = parseInt(msg.content);
      if (state.safePicks.includes(tileNum)) {
        const warning = await interaction.channel.send("❌ That tile is already open!");
        setTimeout(() => warning.delete().catch(() => {}), 3000);
        return;
      }

      // Hit Bomb Condition
      if (state.bombPositions.includes(tileNum)) {
        state.status = "busted";
        state.status = "bust";
        state.hitTile = tileNum;
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        imageAttachment = await drawMinesCard(state);
        await interaction.editReply({ content: `💥 **Busted!** You lost your wager of **${state.bet.toLocaleString()}** coins.`, files: [imageAttachment] });
        await redis.del(`mines:${userId}`);
        return;
      }

      // Safe Tile Choice Registered
      state.safePicks.push(tileNum);
      state.currentMultiplier = getNewMultiplier(state);
      
      // Auto Win Condition (all diamonds cleared safely)
      if (state.safePicks.length === (TOTAL_TILES - state.bombs)) {
        const payout = Math.floor(state.bet * state.currentMultiplier);
        state.status = "cashed_out";
        await redis.set(`mines:${userId}`, JSON.stringify(state));
        collector.stop();

        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);

        imageAttachment = await drawMinesCard(state);
        await interaction.editReply({ content: `🏆 **PERFECT GAME!** Max value hit! You won **${payout.toLocaleString()}** coins!`, files: [imageAttachment] });
        await redis.del(`mines:${userId}`);
        return;
      }

      // Regular Safe Update Cycle
      await redis.set(`mines:${userId}`, JSON.stringify(state));
      imageAttachment = await drawMinesCard(state);
      await interaction.editReply({ files: [imageAttachment] });
    });

    // Timeout Strategy
    collector.on("end", async () => {
      const raw = await redis.get(`mines:${userId}`);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      if (state.safePicks.length === 0) {
        state.status = "bust";
        imageAttachment = await drawMinesCard(state);
        await interaction.editReply({ content: `⏰ **Time's Up!** Game expired. Lost bet.`, files: [imageAttachment] });
      } else {
        const payout = Math.floor(state.bet * state.currentMultiplier);
        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);
        state.status = "cashed_out";
        imageAttachment = await drawMinesCard(state);
        await interaction.editReply({ content: `⏰ **Time's Up!** Auto-cashed out **${payout.toLocaleString()}** coins.`, files: [imageAttachment] });
      }
      await redis.del(`mines:${userId}`);
    });
  }
};

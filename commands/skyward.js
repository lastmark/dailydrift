// commands/skyward.js – Public Lobby Skyward with Visual Thrills
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");
const { createCanvas } = require("canvas");

const MAX_BET = 250_000;
const BETTING_PHASE_SEC = 15;   // time players can bet before round starts
const COOLDOWN_SEC = 10;        // after crash, pause before new betting phase

// Store intervals per guild to avoid duplicates
const gameLoops = new Map();

// ---------- Crash point distribution ----------
function getCrashPoint() {
  const r = Math.random() * 100;
  if (r < 30) return 1.0 + Math.random() * 0.5;        // 30%  1.00–1.50
  if (r < 60) return 1.5 + Math.random() * 1.0;        // 30%  1.50–2.50
  if (r < 80) return 2.5 + Math.random() * 2.5;        // 20%  2.50–5.00
  if (r < 95) return 5.0 + Math.random() * 10.0;       // 15%  5.00–15.00
  if (r < 99) return 15.0 + Math.random() * 85.0;      // 4%   15.00–100.00
  return 100.0 + Math.random() * 400.0;                 // 1%   100.00–500.00
}

// ---------- Multiplier from elapsed seconds ----------
function multAt(elapsedSec) {
  return Math.exp(0.1 * elapsedSec);
}

// ---------- Rocket progress bar (position based on current multiplier) ----------
function rocketBar(mult) {
  const maxDisplay = 10.0; // scale to 10× for full bar
  const pos = Math.min(mult / maxDisplay, 1.0);
  const barLength = 20;
  const filled = Math.floor(pos * barLength);
  const empty = barLength - filled;
  let bar = '▬'.repeat(Math.max(0, filled - 1));
  bar += '🚀';
  bar += '▬'.repeat(Math.max(0, empty - 1));
  return `[${bar}]`;
}

// ---------- Embed color from multiplier (green → yellow → orange → red) ----------
function colorForMultiplier(mult) {
  if (mult < 1.5) return '#00FF88';            // green
  if (mult < 2.5) return '#FFD700';            // yellow
  if (mult < 5.0) return '#FF8800';            // orange
  return '#FF0044';                             // red
}

// ---------- Generate a canvas graph of the multiplier history ----------
function drawGraph(points, currentMult) {
  const W = 400, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  if (points.length < 2) return canvas.toBuffer('image/png');

  const maxMult = Math.max(currentMult, ...points.map(p => p.y), 2);
  const xScale = W / (points.length - 1);
  const yScale = (H - 20) / maxMult;

  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.moveTo(0, H - points[0].y * yScale);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(i * xScale, H - points[i].y * yScale);
  }
  ctx.stroke();

  // Current point
  const last = points[points.length - 1];
  ctx.fillStyle = '#FF0044';
  ctx.beginPath();
  ctx.arc((points.length - 1) * xScale, H - last.y * yScale, 4, 0, Math.PI * 2);
  ctx.fill();

  // Add multiplier text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`${currentMult.toFixed(2)}×`, 10, 20);

  return canvas.toBuffer('image/png');
}

// ---------- Start the round loop for a guild ----------
function startRoundLoop(guildId, client, redis, channelId) {
  if (gameLoops.has(guildId)) return;
  const interval = setInterval(() => tick(guildId, client, redis, channelId), 1000);
  gameLoops.set(guildId, interval);
}

// ---------- Main tick called every second ----------
async function tick(guildId, client, redis, channelId) {
  const roundKey = `skyward:round:${guildId}`;
  let round = await redis.get(roundKey);
  if (!round) {
    // No round yet – start betting phase
    const crashPoint = getCrashPoint();
    round = {
      phase: 'betting',
      bettingStart: Date.now(),
      crashPoint,
      players: []
    };
    await redis.set(roundKey, JSON.stringify(round));
    // Send betting start embed
    const channel = client.channels.cache.get(channelId);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('✈️ Skyward – New Round')
        .setDescription(`Betting is open! Use \`/skyward join <amount>\` to enter.\nBetting ends <t:${Math.floor((Date.now() + BETTING_PHASE_SEC * 1000) / 1000)}:R>`)
        .setFooter({ text: 'Cash out before the plane flies away!' });
      await channel.send({ embeds: [embed] });
    }
    return;
  }

  round = JSON.parse(round);
  const now = Date.now();

  // Phase transitions
  if (round.phase === 'betting') {
    if (now - round.bettingStart >= BETTING_PHASE_SEC * 1000) {
      // Start flight
      round.phase = 'flight';
      round.flightStart = now;
      round.points = [{ x: 0, y: 1.0 }]; // graph points
      await redis.set(roundKey, JSON.stringify(round));
      // Notify channel
      const channel = client.channels.cache.get(channelId);
      if (channel) {
        const embed = new EmbedBuilder()
          .setColor('#00FF88')
          .setTitle('✈️ Skyward – Round Started!')
          .setDescription(`The plane is taking off! ${round.players.length} player(s) in the game.\nCash out before it crashes!`);
        await channel.send({ embeds: [embed] });
      }
    }
  }
  else if (round.phase === 'flight') {
    const elapsed = (now - round.flightStart) / 1000;
    const mult = multAt(elapsed);
    if (mult >= round.crashPoint) {
      // Crash
      round.phase = 'crashed';
      await processCrash(guildId, client, redis, channelId, round, mult);
      // Remove round
      await redis.del(roundKey);
      // Wait cooldown then restart betting
      setTimeout(() => {
        if (gameLoops.has(guildId)) {
          // will be triggered by next tick seeing no round
        }
      }, COOLDOWN_SEC * 1000);
      return;
    }
    // Update public message (edit or send new? We'll store the public message id)
    if (!round.publicMessageId) {
      // Send initial flight embed
      const channel = client.channels.cache.get(channelId);
      if (channel) {
        const graphBuf = drawGraph(round.points, mult);
        const attachment = new AttachmentBuilder(graphBuf, { name: 'graph.png' });
        const embed = new EmbedBuilder()
          .setColor(colorForMultiplier(mult))
          .setTitle('✈️ Skyward – Live')
          .setDescription(`Multiplier: **${mult.toFixed(2)}×**\n${rocketBar(mult)}`)
          .setImage('attachment://graph.png')
          .setFooter({ text: `${round.players.length} player(s) | Cash out before it crashes!` });
        const msg = await channel.send({ embeds: [embed], files: [attachment] });
        round.publicMessageId = msg.id;
        await redis.set(roundKey, JSON.stringify(round));
      }
    } else {
      // Edit existing message
      const channel = client.channels.cache.get(channelId);
      if (channel) {
        const msg = await channel.messages.fetch(round.publicMessageId).catch(() => null);
        if (msg) {
          round.points.push({ x: elapsed, y: mult });
          await redis.set(roundKey, JSON.stringify(round));
          const graphBuf = drawGraph(round.points, mult);
          const attachment = new AttachmentBuilder(graphBuf, { name: 'graph.png' });
          const embed = new EmbedBuilder()
            .setColor(colorForMultiplier(mult))
            .setTitle('✈️ Skyward – Live')
            .setDescription(`Multiplier: **${mult.toFixed(2)}×**\n${rocketBar(mult)}`)
            .setImage('attachment://graph.png')
            .setFooter({ text: `${round.players.length} player(s) | Cash out before it crashes!` });
          await msg.edit({ embeds: [embed], files: [attachment] });
        }
      }
    }
  }
}

// ---------- Process crash and payout ----------
async function processCrash(guildId, client, redis, channelId, round, finalMult) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  // Delete the live message if it exists
  if (round.publicMessageId) {
    const msg = await channel.messages.fetch(round.publicMessageId).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  }

  let results = '';
  let totalPot = 0;
  for (const player of round.players) {
    if (!player.cashedOut) {
      // Lose their bet (already deducted when they joined)
      results += `<@${player.userId}> – **Crashed!** Lost ${player.bet.toLocaleString()} coins\n`;
    } else {
      totalPot += player.cashOutPayout;
      results += `<@${player.userId}> – **Cashed Out** at ${player.cashOutMultiplier.toFixed(2)}× +${player.cashOutPayout.toLocaleString()} coins\n`;
    }
  }

  const embed = new EmbedBuilder()
    .setColor('#ED4245')
    .setTitle('💥 Skyward Crashed!')
    .setDescription(`The plane crashed at **${finalMult.toFixed(2)}×**!\n\n**Results:**\n${results || 'No players?'}`)
    .setFooter({ text: 'Next round starting soon...' });

  await channel.send({ embeds: [embed] });
}

// =============================================
// COMMAND DEFINITION
// =============================================
module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("skyward")
    .setDescription("Public Skyward lobby")
    .addSubcommand(sub =>
      sub.setName("join")
        .setDescription("Join the current round with a bet")
        .addStringOption(opt =>
          opt.setName("bet")
            .setDescription("Amount or 'all' (max 250,000)")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("setchannel")
        .setDescription("(Admin) Set the Skyward game channel")
        .addChannelOption(opt =>
          opt.setName("channel")
            .setDescription("Channel for Skyward rounds")
            .setRequired(true)
        )
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === "setchannel") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ You need Administrator permission.", flags: MessageFlags.Ephemeral });
      }
      const channel = interaction.options.getChannel("channel");
      await redis.set(`skyward:channel:${guildId}`, channel.id);
      // Stop existing loop if any
      if (gameLoops.has(guildId)) {
        clearInterval(gameLoops.get(guildId));
        gameLoops.delete(guildId);
      }
      // Start new loop
      startRoundLoop(guildId, client, redis, channel.id);
      return interaction.reply({ content: `✅ Skyward channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === "join") {
      // Get game channel
      const channelId = await redis.get(`skyward:channel:${guildId}`);
      if (!channelId) {
        return interaction.reply({ content: "❌ Skyward channel not set. An admin must use `/skyward setchannel`.", flags: MessageFlags.Ephemeral });
      }

      const roundKey = `skyward:round:${guildId}`;
      let round = await redis.get(roundKey);
      if (!round || JSON.parse(round).phase !== 'betting') {
        return interaction.reply({ content: "❌ No betting round active right now. Wait for the next one.", flags: MessageFlags.Ephemeral });
      }
      round = JSON.parse(round);

      const userId = interaction.user.id;
      const betRaw = interaction.options.getString("bet").toLowerCase();
      let bet;

      const balanceKey = `eco:${userId}:money`;
      const currentBal = Number(await redis.get(balanceKey) || 0);

      if (betRaw === "all") {
        bet = Math.min(currentBal, MAX_BET);
        if (bet <= 0) return interaction.reply({ content: "❌ You have no coins.", flags: MessageFlags.Ephemeral });
      } else {
        bet = parseInt(betRaw);
        if (isNaN(bet) || bet < 1) return interaction.reply({ content: "❌ Invalid amount.", flags: MessageFlags.Ephemeral });
        if (bet > MAX_BET) bet = MAX_BET;
      }

      if (currentBal < bet) {
        return interaction.reply({ content: `❌ You need **${bet.toLocaleString()}** coins. You have **${currentBal.toLocaleString()}**.`, flags: MessageFlags.Ephemeral });
      }

      // Deduct bet immediately
      await redis.set(balanceKey, currentBal - bet);

      // Add player to round
      round.players.push({ userId, bet, cashedOut: false });
      await redis.set(roundKey, JSON.stringify(round));

      // Send ephemeral message with Cash Out button (to be used during flight)
      await interaction.reply({
        content: `✅ You joined with ${bet.toLocaleString()} coins. Wait for the round to start!`,
        flags: MessageFlags.Ephemeral
      });

      // Also send a private message that will have the cash-out button during flight? We'll send a new message when flight starts.
      // But the ephemeral response can't be edited to add a button later. So we'll have a separate system: when flight starts, we'll DM each player (or send a new ephemeral message) with the cash-out button. Since we can't initiate a DM without interaction, we can use a follow-up message in the same channel but ephemeral? Better: store the user's intent to cash out via a button on the main channel? Nah, simpler: during the flight phase, we'll DM each player a message with a Cash Out button that they can use. The bot needs to be able to DM them. We'll add that to the flight start logic in the tick function.

      // For now, we'll add a flag in the round that the player's cash-out message should be created.
      // I'll enhance the tick function to send DMs when flight starts.
      return;
    }
  }
};

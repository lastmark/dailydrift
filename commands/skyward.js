// commands/rocket.js – Public Rocket (stylish, auto-pause when idle)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");
const { createCanvas } = require("canvas");

const MAX_BET = 250_000;
const BETTING_PHASE_SEC = 12;
const COOLDOWN_SEC = 6;

const CASHOUT_EMOJI = "🚀";

// ---------- Crash point ----------
function getCrashPoint() {
  const min = 1.20;
  const max = 100.00;
  const r = Math.random();
  return Math.min(max, min / (1 - r));
}

function multAt(elapsedSec) {
  return Math.exp(0.1 * elapsedSec);
}

// ---------- Visuals ----------
function stylishBar(mult) {
  const maxDisplay = 50.0;
  const clamped = Math.min(mult, maxDisplay);
  const ratio = clamped / maxDisplay;
  const totalBlocks = 16;
  const filled = Math.floor(ratio * totalBlocks);
  const empty = totalBlocks - filled;
  let bar = '';
  if (filled > 0) bar += '🟩'.repeat(filled);
  bar += '🚀';
  if (empty > 1) bar += '⬛'.repeat(empty - 1);
  return bar;
}

function colorForMultiplier(mult) {
  if (mult < 2.0) return '#00FF88';
  if (mult < 5.0) return '#FFD700';
  if (mult < 15.0) return '#FF8800';
  return '#FF0044';
}

function drawGraph(points, currentMult) {
  const W = 400, H = 120;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);
  if (points.length < 2) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`${currentMult.toFixed(2)}×`, 10, 25);
    return canvas.toBuffer('image/png');
  }
  const maxY = Math.max(currentMult, ...points.map(p => p.y), 2);
  const xScale = (W - 40) / (points.length - 1);
  const yScale = (H - 30) / maxY;
  const baseY = H - 20;
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 0, 68, 0.1)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(20, baseY);
  for (let i = 0; i < points.length; i++) {
    ctx.lineTo(20 + i * xScale, baseY - points[i].y * yScale);
  }
  ctx.lineTo(20 + (points.length - 1) * xScale, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.moveTo(20, baseY - points[0].y * yScale);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(20 + i * xScale, baseY - points[i].y * yScale);
  }
  ctx.stroke();
  const last = points[points.length - 1];
  ctx.fillStyle = '#FF0044';
  ctx.beginPath();
  ctx.arc(20 + (points.length - 1) * xScale, baseY - last.y * yScale, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`${currentMult.toFixed(2)}×`, 10, 20);
  return canvas.toBuffer('image/png');
}

// ---------- Round counter ----------
async function getNextRoundNumber(redis, guildId) {
  return await redis.incr(`rocket:roundCounter:${guildId}`);
}

// ---------- Store game loops per guild ----------
const gameLoops = new Map();   // guildId → interval

// ---------- Core tick ----------
async function tick(guildId, client, redis) {
  const channelId = await redis.get(`rocket:channel:${guildId}`);
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const roundKey = `rocket:round:${guildId}`;
  const now = Date.now();

  let round = await redis.get(roundKey);
  if (!round) {
    // Start new betting phase
    const roundNum = await getNextRoundNumber(redis, guildId);
    round = {
      phase: 'betting',
      bettingStart: now,
      crashPoint: getCrashPoint(),
      players: [],
      messages: [],
      roundNumber: roundNum,
    };
    await redis.set(roundKey, JSON.stringify(round));

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🚀 Rocket – Round #${roundNum}`)
      .setDescription(
        `**Betting is open!**\nUse \`/rocket join <amount>\`\n` +
        `Ends <t:${Math.floor((now + BETTING_PHASE_SEC * 1000) / 1000)}:R>\n\n` +
        `Crash range: **1.20× – 100.00×**`
      )
      .setFooter({ text: 'Place your bets…' });

    const msg = await channel.send({ embeds: [embed] });
    round.messages.push(msg.id);
    await redis.set(roundKey, JSON.stringify(round));
    return;
  }

  round = JSON.parse(round);

  // Betting → Flight (or pause if no players)
  if (round.phase === 'betting') {
    if (now - round.bettingStart >= BETTING_PHASE_SEC * 1000) {
      if (round.players.length === 0) {
        // No one joined → delete messages, stop loop
        await cleanChannel(channel, round.messages);
        await redis.del(roundKey);
        stopGameLoop(guildId);
        return;
      }

      // Start flight
      round.phase = 'flight';
      round.startTime = now;
      round.points = [{ y: 1.0 }];
      await redis.set(roundKey, JSON.stringify(round));

      await cleanChannel(channel, round.messages);
      round.messages = [];

      const totalPot = round.players.reduce((sum, p) => sum + p.bet, 0);

      const embed = new EmbedBuilder()
        .setColor('#00FF88')
        .setTitle('🚀 Rocket – Live')
        .setDescription(
          `**Multiplier:** 1.00×\n` +
          `${stylishBar(1.0)}\n` +
          `👥 **Players:** ${round.players.length} | 💰 **Pot:** ${totalPot.toLocaleString()} coins\n\n` +
          `React with ${CASHOUT_EMOJI} to **Cash Out**!`
        )
        .setImage('attachment://graph.png');

      const graphBuf = drawGraph(round.points, 1.0);
      const attachment = new AttachmentBuilder(graphBuf, { name: 'graph.png' });
      const msg = await channel.send({ embeds: [embed], files: [attachment] });
      await msg.react(CASHOUT_EMOJI).catch(() => {});
      round.flightMessageId = msg.id;
      round.messages.push(msg.id);
      await redis.set(roundKey, JSON.stringify(round));

      // Reaction collector
      const filter = (reaction, user) =>
        reaction.emoji.name === CASHOUT_EMOJI && !user.bot;
      const collector = msg.createReactionCollector({ filter, time: 600_000 });
      collector.on('collect', async (reaction, user) => {
        await reaction.users.remove(user).catch(() => {});
        const raw = await redis.get(roundKey);
        if (!raw) return;
        const state = JSON.parse(raw);
        if (state.phase !== 'flight') return;
        const player = state.players.find(p => p.userId === user.id);
        if (!player || player.cashedOut) return;

        const elapsed = (Date.now() - state.startTime) / 1000;
        const mult = multAt(elapsed);
        if (mult >= state.crashPoint) return;

        player.cashedOut = true;
        player.payout = Math.floor(player.bet * mult);
        player.cashOutMultiplier = mult;
        await redis.set(roundKey, JSON.stringify(state));

        const balanceKey = `eco:${user.id}:money`;
        const bal = Number(await redis.get(balanceKey) || 0);
        await redis.set(balanceKey, bal + player.payout);

        // DM
        try {
          const userObj = await client.users.fetch(user.id);
          const dmEmbed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('💰 Cashed Out!')
            .setDescription(
              `You cashed out at **${mult.toFixed(2)}×** and won **${player.payout.toLocaleString()}** coins!\n` +
              `Bet: ${player.bet.toLocaleString()} coins`
            );
          await userObj.send({ embeds: [dmEmbed] });
        } catch (e) {}
      });
    }
    return;
  }

  // Flight → Crash / update
  if (round.phase === 'flight') {
    const elapsed = (now - round.startTime) / 1000;
    const mult = multAt(elapsed);

    if (mult >= round.crashPoint) {
      await cleanChannel(channel, round.messages);

      let results = '';
      for (const p of round.players) {
        if (p.cashedOut) {
          results += `<@${p.userId}> – **Cashed Out** at ${p.cashOutMultiplier.toFixed(2)}× (+${p.payout.toLocaleString()} coins)\n`;
        } else {
          results += `<@${p.userId}> – **Crashed** (lost ${p.bet.toLocaleString()} coins)\n`;
        }
      }

      const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle(`💥 Rocket Crashed! (Round #${round.roundNumber})`)
        .setDescription(`Crashed at **${mult.toFixed(2)}×**!\n\n**Results:**\n${results || 'No players'}`)
        .setFooter({ text: 'Next round starting soon…' });

      const msg = await channel.send({ embeds: [embed] });
      setTimeout(() => msg.delete().catch(() => {}), COOLDOWN_SEC * 1000);

      await redis.del(roundKey);
      await redis.set(`rocket:cooldown:${guildId}`, '1', 'EX', COOLDOWN_SEC);
      return;
    }

    // Update flight message
    const msg = await channel.messages.fetch(round.flightMessageId).catch(() => null);
    if (!msg || !msg.embeds?.length) {
      await redis.del(roundKey);
      return;
    }

    try {
      round.points.push({ y: mult });
      await redis.set(roundKey, JSON.stringify(round));

      const totalPot = round.players.reduce((sum, p) => sum + p.bet, 0);
      const embed = EmbedBuilder.from(msg.embeds[0])
        .setColor(colorForMultiplier(mult))
        .setDescription(
          `**Multiplier:** ${mult.toFixed(2)}×\n` +
          `${stylishBar(mult)}\n` +
          `👥 **Players:** ${round.players.length} | 💰 **Pot:** ${totalPot.toLocaleString()} coins\n\n` +
          `React with ${CASHOUT_EMOJI} to **Cash Out**!`
        );

      const graphBuf = drawGraph(round.points, mult);
      const attachment = new AttachmentBuilder(graphBuf, { name: 'graph.png' });
      await msg.edit({ embeds: [embed], files: [attachment] }).catch(() => {});
    } catch (err) {
      console.error('Rocket update error:', err);
      await redis.del(roundKey);
    }
  }
}

// ---------- Helpers ----------
async function cleanChannel(channel, messageIds) {
  for (const id of messageIds) {
    const msg = await channel.messages.fetch(id).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  }
}

function startGameLoop(guildId, client, redis, channelId) {
  if (gameLoops.has(guildId)) return;
  const interval = setInterval(() => tick(guildId, client, redis), 1000);
  gameLoops.set(guildId, interval);
}

function stopGameLoop(guildId) {
  if (gameLoops.has(guildId)) {
    clearInterval(gameLoops.get(guildId));
    gameLoops.delete(guildId);
  }
}

// ---------- Command ----------
module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("rocket")
    .setDescription("Public Rocket crash game")
    .addSubcommand(sub =>
      sub.setName("setchannel")
        .setDescription("(Admin) Set the Rocket game channel")
        .addChannelOption(opt =>
          opt.setName("channel")
            .setDescription("Channel for rounds")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("join")
        .setDescription("Join the current betting round")
        .addStringOption(opt =>
          opt.setName("bet")
            .setDescription("Amount or 'all' (max 250,000)")
            .setRequired(true)
        )
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === "setchannel") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "❌ Admin only.", flags: MessageFlags.Ephemeral });

      const channel = interaction.options.getChannel("channel");
      await redis.set(`rocket:channel:${guildId}`, channel.id);

      stopGameLoop(guildId);
      startGameLoop(guildId, client, redis, channel.id);

      await redis.del(`rocket:round:${guildId}`);
      await redis.del(`rocket:cooldown:${guildId}`);

      return interaction.reply({
        content: `✅ Rocket channel set to ${channel}. Rounds will start automatically.`,
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === "join") {
      const channelId = await redis.get(`rocket:channel:${guildId}`);
      if (!channelId)
        return interaction.reply({ content: "❌ Rocket channel not set.", flags: MessageFlags.Ephemeral });

      // If game loop is stopped (paused), resume it
      if (!gameLoops.has(guildId)) {
        startGameLoop(guildId, client, redis, channelId);
      }

      // Cooldown after crash
      if (await redis.get(`rocket:cooldown:${guildId}`))
        return interaction.reply({ content: "⏳ Round just ended. Next round soon.", flags: MessageFlags.Ephemeral });

      // If no active round, wait a moment for the tick to create one (or create manually)
      let raw = await redis.get(`rocket:round:${guildId}`);
      if (!raw) {
        // Manually create a fresh round right now (so the player can join immediately)
        const roundNum = await getNextRoundNumber(redis, guildId);
        const newRound = {
          phase: 'betting',
          bettingStart: Date.now(),
          crashPoint: getCrashPoint(),
          players: [],
          messages: [],
          roundNumber: roundNum,
        };
        // Send betting message
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🚀 Rocket – Round #${roundNum}`)
            .setDescription(
              `**Betting is open!**\nUse \`/rocket join <amount>\`\n` +
              `Ends <t:${Math.floor((Date.now() + BETTING_PHASE_SEC * 1000) / 1000)}:R>\n\n` +
              `Crash range: **1.20× – 100.00×**`
            )
            .setFooter({ text: 'Place your bets…' });
          const msg = await channel.send({ embeds: [embed] });
          newRound.messages.push(msg.id);
        }
        await redis.set(`rocket:round:${guildId}`, JSON.stringify(newRound));
        raw = JSON.stringify(newRound);
      }

      const round = JSON.parse(raw);
      if (round.phase !== 'betting')
        return interaction.reply({ content: "❌ Betting phase is over.", flags: MessageFlags.Ephemeral });

      const userId = interaction.user.id;
      if (round.players.some(p => p.userId === userId))
        return interaction.reply({ content: "❌ You already joined this round.", flags: MessageFlags.Ephemeral });

      const betRaw = interaction.options.getString("bet").toLowerCase();
      let bet;
      const balanceKey = `eco:${userId}:money`;
      const bal = Number(await redis.get(balanceKey) || 0);

      if (betRaw === "all") {
        bet = Math.min(bal, MAX_BET);
        if (bet <= 0) return interaction.reply({ content: "❌ No coins.", flags: MessageFlags.Ephemeral });
      } else {
        bet = parseInt(betRaw);
        if (isNaN(bet) || bet < 1) return interaction.reply({ content: "❌ Invalid bet.", flags: MessageFlags.Ephemeral });
        if (bet > MAX_BET) bet = MAX_BET;
      }
      if (bal < bet) return interaction.reply({ content: `❌ Need **${bet.toLocaleString()}** coins.`, flags: MessageFlags.Ephemeral });

      await redis.set(balanceKey, bal - bet);
      round.players.push({ userId, bet, cashedOut: false });
      await redis.set(`rocket:round:${guildId}`, JSON.stringify(round));

      return interaction.reply({
        content: `✅ Joined with **${bet.toLocaleString()}** coins. React with 🚀 on the flight message to cash out.`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

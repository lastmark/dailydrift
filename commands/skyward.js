// commands/skyward.js – Public Rocket (clean channel, DM winners, live graph, up to 1000x)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");
const { createCanvas } = require("canvas");

const MAX_BET = 250_000;
const BETTING_PHASE_SEC = 15;
const COOLDOWN_SEC = 8;

const CASHOUT_EMOJI = "🚀";

// ---------- Crash point (1.00 – 1000.00, completely random) ----------
function getCrashPoint() {
  return 1.0 + Math.random() * 999.0;
}

function multAt(elapsedSec) {
  return Math.exp(0.1 * elapsedSec);
}

// ---------- Rocket bar ----------
function rocketBar(mult) {
  const maxDisplay = 1000.0;
  const pos = Math.min(mult / maxDisplay, 1.0);
  const barLen = 20;
  const filled = Math.floor(pos * barLen);
  const empty = barLen - filled - 1;
  if (filled <= 0) return `🚀${'▬'.repeat(barLen - 1)}`;
  if (filled >= barLen) return `${'▬'.repeat(barLen - 1)}🚀`;
  return `${'▬'.repeat(filled - 1)}🚀${'▬'.repeat(empty)}`;
}

function colorForMultiplier(mult) {
  if (mult < 2.0) return '#00FF88';
  if (mult < 5.0) return '#FFD700';
  if (mult < 20.0) return '#FF8800';
  return '#FF0044';
}

// ---------- Live graph (canvas) ----------
function drawGraph(points, currentMult) {
  const W = 400, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  if (points.length < 2) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`${currentMult.toFixed(2)}×`, 10, 30);
    return canvas.toBuffer('image/png');
  }

  const maxY = Math.max(currentMult, ...points.map(p => p.y), 2);
  const xScale = (W - 40) / (points.length - 1);
  const yScale = (H - 40) / maxY;

  ctx.beginPath();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.moveTo(20, H - 20 - points[0].y * yScale);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(20 + i * xScale, H - 20 - points[i].y * yScale);
  }
  ctx.stroke();

  const last = points[points.length - 1];
  ctx.fillStyle = '#FF0044';
  ctx.beginPath();
  ctx.arc(20 + (points.length - 1) * xScale, H - 20 - last.y * yScale, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`${currentMult.toFixed(2)}×`, 10, 20);

  return canvas.toBuffer('image/png');
}

// ---------- Store game intervals per guild ----------
const gameLoops = new Map();

// ---------- Main tick (runs every second) ----------
async function tick(guildId, client, redis) {
  const channelId = await redis.get(`skyward:channel:${guildId}`);
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const roundKey = `skyward:round:${guildId}`;
  const now = Date.now();

  let round = await redis.get(roundKey);
  if (!round) {
    // Start new betting phase
    round = {
      phase: 'betting',
      bettingStart: now,
      crashPoint: getCrashPoint(),
      players: [],
      flightMessageId: null,
      bettingMessageId: null,
      startTime: null,
      points: []
    };
    await redis.set(roundKey, JSON.stringify(round));
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🚀 Skyward – New Round')
      .setDescription(
        `Betting is open! Use \`/skyward join <amount>\`.\n` +
        `Ends <t:${Math.floor((now + BETTING_PHASE_SEC * 1000) / 1000)}:R>\n\n` +
        `Crash range: **1.00× – 1,000.00×**`
      );
    const msg = await channel.send({ embeds: [embed] });
    round.bettingMessageId = msg.id;
    await redis.set(roundKey, JSON.stringify(round));
    return;
  }

  round = JSON.parse(round);

  if (round.phase === 'betting') {
    if (now - round.bettingStart >= BETTING_PHASE_SEC * 1000) {
      // Start flight
      round.phase = 'flight';
      round.startTime = now;
      round.points = [{ y: 1.0 }];
      await redis.set(roundKey, JSON.stringify(round));

      // Delete betting message
      if (round.bettingMessageId) {
        const betMsg = await channel.messages.fetch(round.bettingMessageId).catch(() => null);
        if (betMsg) await betMsg.delete().catch(() => {});
      }

      // Send flight embed
      const embed = new EmbedBuilder()
        .setColor('#00FF88')
        .setTitle('🚀 Skyward – Live')
        .setDescription(
          `Multiplier: **1.00×**\n${rocketBar(1.0)}\n` +
          `${round.players.length} player(s) in. React with ${CASHOUT_EMOJI} to cash out!`
        )
        .setImage('attachment://graph.png');

      const graphBuf = drawGraph(round.points, 1.0);
      const attachment = new AttachmentBuilder(graphBuf, { name: 'graph.png' });
      const msg = await channel.send({ embeds: [embed], files: [attachment] });
      await msg.react(CASHOUT_EMOJI).catch(() => {});
      round.flightMessageId = msg.id;
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
        if (mult >= state.crashPoint) return; // crash already

        player.cashedOut = true;
        player.payout = Math.floor(player.bet * mult);
        player.cashOutMultiplier = mult;
        await redis.set(roundKey, JSON.stringify(state));

        const balanceKey = `eco:${user.id}:money`;
        const bal = Number(await redis.get(balanceKey) || 0);
        await redis.set(balanceKey, bal + player.payout);

        // DM the winner
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
        } catch (e) {
          // DM closed, ignore
        }
      });
    }
  }
  else if (round.phase === 'flight') {
    const elapsed = (now - round.startTime) / 1000;
    const mult = multAt(elapsed);

    if (mult >= round.crashPoint) {
      // Crash! Delete flight message, then show result embed
      const flightMsg = await channel.messages.fetch(round.flightMessageId).catch(() => null);
      if (flightMsg) await flightMsg.delete().catch(() => {});

      // Build result embed
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
        .setTitle('💥 Skyward Crashed!')
        .setDescription(`Crashed at **${mult.toFixed(2)}×**!\n\n**Results:**\n${results || 'No players'}`)
        .setFooter({ text: 'Next round starting soon...' });

      const resultMsg = await channel.send({ embeds: [embed] });

      // Delete result message after cooldown to keep channel clean
      setTimeout(() => resultMsg.delete().catch(() => {}), COOLDOWN_SEC * 1000);

      await redis.del(roundKey);
      await redis.set(`skyward:cooldown:${guildId}`, '1', 'EX', COOLDOWN_SEC);
    } else {
      // Update flight message
      const msg = await channel.messages.fetch(round.flightMessageId).catch(() => null);
      if (msg) {
        // ** FIX ** ensure embeds exist
        if (msg.embeds && msg.embeds.length > 0) {
          try {
            round.points.push({ y: mult });
            await redis.set(roundKey, JSON.stringify(round));

            const embed = EmbedBuilder.from(msg.embeds[0])
              .setColor(colorForMultiplier(mult))
              .setDescription(
                `Multiplier: **${mult.toFixed(2)}×**\n${rocketBar(mult)}\n` +
                `${round.players.length} player(s) in. React with ${CASHOUT_EMOJI} to cash out!`
              );

            const graphBuf = drawGraph(round.points, mult);
            const attachment = new AttachmentBuilder(graphBuf, { name: 'graph.png' });
            await msg.edit({ embeds: [embed], files: [attachment] }).catch(() => {});
          } catch (err) {
            console.error('Failed to update flight message:', err);
          }
        } else {
          // flight message lost its embeds (deleted externally) – end round gracefully
          console.error('Flight message has no embeds, ending round.');
          const embed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('💥 Skyward Crashed!')
            .setDescription('The round ended unexpectedly.')
            .setFooter({ text: 'Next round starting soon...' });
          await channel.send({ embeds: [embed] });
          await redis.del(roundKey);
          await redis.set(`skyward:cooldown:${guildId}`, '1', 'EX', COOLDOWN_SEC);
        }
      }
    }
  }
}

// =============================================================================
// Command definition
// =============================================================================
module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("skyward")
    .setDescription("Public Skyward game")
    .addSubcommand(sub =>
      sub.setName("setchannel")
        .setDescription("(Admin) Set the Skyward game channel")
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
      await redis.set(`skyward:channel:${guildId}`, channel.id);

      // Stop any existing loop
      if (gameLoops.has(guildId)) {
        clearInterval(gameLoops.get(guildId));
        gameLoops.delete(guildId);
      }

      // Start fresh interval
      const interval = setInterval(() => tick(guildId, client, redis), 1000);
      gameLoops.set(guildId, interval);

      // Wipe old round data
      await redis.del(`skyward:round:${guildId}`);
      await redis.del(`skyward:cooldown:${guildId}`);

      return interaction.reply({
        content: `✅ Skyward channel set to ${channel}. Rounds will start automatically.`,
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === "join") {
      const channelId = await redis.get(`skyward:channel:${guildId}`);
      if (!channelId)
        return interaction.reply({ content: "❌ Skyward channel not set.", flags: MessageFlags.Ephemeral });

      // Cooldown check
      if (await redis.get(`skyward:cooldown:${guildId}`))
        return interaction.reply({ content: "⏳ Round just ended. Next round soon.", flags: MessageFlags.Ephemeral });

      const raw = await redis.get(`skyward:round:${guildId}`);
      if (!raw)
        return interaction.reply({ content: "❌ No active round. Wait for betting to open.", flags: MessageFlags.Ephemeral });

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
      await redis.set(`skyward:round:${guildId}`, JSON.stringify(round));

      return interaction.reply({
        content: `✅ Joined with **${bet.toLocaleString()}** coins. React with 🚀 on the flight message to cash out.`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

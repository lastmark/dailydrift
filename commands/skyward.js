// commands/rocket.js – Super‑smooth Rocket (plane animation, 600ms updates)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");
const { createCanvas, loadImage } = require("canvas");

const MAX_BET = 250_000;
const BETTING_PHASE_SEC = 12;
const COOLDOWN_SEC = 6;
const CASHOUT_EMOJI = "🚀";
const UPDATE_INTERVAL_MS = 600;   // smooth 1.6 FPS, no rate‑limit issues

// ---------- Crash point ----------
function getCrashPoint() {
  const min = 1.20;
  const max = 100.00;
  return Math.min(max, min / (1 - Math.random()));
}

function multAt(elapsedSec) {
  return Math.exp(0.1 * elapsedSec);
}

// ---------- Stylish bar ----------
function stylishBar(mult) {
  const maxDisp = 50.0;
  const clamped = Math.min(mult, maxDisp);
  const ratio = clamped / maxDisp;
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

// ---------- Smooth graph with flying plane ----------
function drawGraph(points, currentMult) {
  const W = 400, H = 120;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Dark background
  ctx.fillStyle = '#0f0f1a';
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

  // Gradient fill under the curve
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, 'rgba(0, 255, 136, 0.25)');
  gradient.addColorStop(1, 'rgba(255, 0, 68, 0.05)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(20, baseY);
  for (let i = 0; i < points.length; i++) {
    ctx.lineTo(20 + i * xScale, baseY - points[i].y * yScale);
  }
  ctx.lineTo(20 + (points.length - 1) * xScale, baseY);
  ctx.closePath();
  ctx.fill();

  // Glowing line
  ctx.beginPath();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 6;
  ctx.moveTo(20, baseY - points[0].y * yScale);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(20 + i * xScale, baseY - points[i].y * yScale);
  }
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Flying plane at the current point
  const last = points[points.length - 1];
  const planeX = 20 + (points.length - 1) * xScale;
  const planeY = baseY - last.y * yScale;

  // Draw plane emoji
  ctx.font = '22px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🚀', planeX, planeY - 12);  // shift up to centre

  // Multiplier text
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`${currentMult.toFixed(2)}×`, 10, 20);

  return canvas.toBuffer('image/png');
}

// ---------- Game state ----------
const gameLoops = new Map();

async function cleanChannel(channel, ids) {
  for (const id of ids) {
    const m = await channel.messages.fetch(id).catch(() => null);
    if (m) await m.delete().catch(() => {});
  }
}

function stopLoop(guildId) {
  if (gameLoops.has(guildId)) {
    clearInterval(gameLoops.get(guildId));
    gameLoops.delete(guildId);
  }
}

// ---------- Betting tick ----------
async function tick(guildId, client, redis) {
  const channelId = await redis.get(`rocket:channel:${guildId}`);
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const roundKey = `rocket:round:${guildId}`;
  const now = Date.now();
  let round = await redis.get(roundKey);

  if (!round) {
    const rNum = await redis.incr(`rocket:roundCounter:${guildId}`);
    round = {
      phase: 'betting', bettingStart: now, crashPoint: getCrashPoint(),
      players: [], messages: [], roundNumber: rNum,
    };
    await redis.set(roundKey, JSON.stringify(round));
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🚀 Rocket – Round #${rNum}`)
      .setDescription(`Betting is open! Use \`/rocket join <amount>\`.\nEnds <t:${Math.floor((now + BETTING_PHASE_SEC * 1000) / 1000)}:R>\n\nCrash range: **1.20× – 100.00×**`)
      .setFooter({ text: 'Place your bets…' });
    const msg = await channel.send({ embeds: [embed] });
    round.messages.push(msg.id);
    await redis.set(roundKey, JSON.stringify(round));
    return;
  }

  round = JSON.parse(round);
  if (round.phase === 'betting') {
    if (now - round.bettingStart >= BETTING_PHASE_SEC * 1000) {
      if (round.players.length === 0) {
        await cleanChannel(channel, round.messages);
        await redis.del(roundKey);
        stopLoop(guildId);
        return;
      }
      // Start flight
      round.phase = 'flight';
      round.startTime = now;
      round.points = [{ y: 1.0 }];
      await redis.set(roundKey, JSON.stringify(round));
      await cleanChannel(channel, round.messages);
      round.messages = [];
      const totalPot = round.players.reduce((s, p) => s + p.bet, 0);
      const embed = new EmbedBuilder()
        .setColor('#00FF88')
        .setTitle('🚀 Rocket – Live')
        .setDescription(`**Multiplier:** 1.00×\n${stylishBar(1.0)}\n👥 **Players:** ${round.players.length} | 💰 **Pot:** ${totalPot.toLocaleString()} coins\n\nReact with ${CASHOUT_EMOJI} to **Cash Out**!`)
        .setImage('attachment://graph.png');
      const graphBuf = drawGraph(round.points, 1.0);
      const attachment = new AttachmentBuilder(graphBuf, { name: 'graph.png' });
      const msg = await channel.send({ embeds: [embed], files: [attachment] });
      await msg.react(CASHOUT_EMOJI).catch(() => {});
      round.flightMessageId = msg.id;
      round.messages.push(msg.id);
      await redis.set(roundKey, JSON.stringify(round));

      // Reaction collector
      const filter = (reaction, user) => reaction.emoji.name === CASHOUT_EMOJI && !user.bot;
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
        try {
          const u = await client.users.fetch(user.id);
          await u.send({ embeds: [new EmbedBuilder().setColor('#57F287').setTitle('💰 Cashed Out!').setDescription(`You cashed out at **${mult.toFixed(2)}×** and won **${player.payout.toLocaleString()}** coins!\nBet: ${player.bet.toLocaleString()} coins`)] });
        } catch (e) {}
      });

      // Smooth flight update loop (600ms)
      const flightInterval = setInterval(async () => {
        const raw = await redis.get(roundKey);
        if (!raw) { clearInterval(flightInterval); return; }
        const state = JSON.parse(raw);
        if (state.phase !== 'flight') { clearInterval(flightInterval); return; }
        const elapsed = (Date.now() - state.startTime) / 1000;
        const mult = multAt(elapsed);
        if (mult >= state.crashPoint) {
          clearInterval(flightInterval);
          state.phase = 'crashed';
          await redis.set(roundKey, JSON.stringify(state));
          await cleanChannel(channel, state.messages);
          let results = '';
          for (const p of state.players) {
            if (p.cashedOut) results += `<@${p.userId}> – **Cashed Out** at ${p.cashOutMultiplier.toFixed(2)}× (+${p.payout.toLocaleString()} coins)\n`;
            else results += `<@${p.userId}> – **Crashed** (lost ${p.bet.toLocaleString()} coins)\n`;
          }
          const embed = new EmbedBuilder().setColor('#ED4245').setTitle(`💥 Rocket Crashed! (Round #${state.roundNumber})`).setDescription(`Crashed at **${mult.toFixed(2)}×**!\n\n**Results:**\n${results || 'No players'}`).setFooter({ text: 'Next round starting soon…' });
          const m = await channel.send({ embeds: [embed] });
          setTimeout(() => m.delete().catch(() => {}), COOLDOWN_SEC * 1000);
          await redis.del(roundKey);
          await redis.set(`rocket:cooldown:${guildId}`, '1', 'EX', COOLDOWN_SEC);
          return;
        }
        // Update embed
        const msg = await channel.messages.fetch(state.flightMessageId).catch(() => null);
        if (!msg || !msg.embeds?.length) { clearInterval(flightInterval); await redis.del(roundKey); return; }
        state.points.push({ y: mult });
        await redis.set(roundKey, JSON.stringify(state));
        const totalPot = state.players.reduce((s, p) => s + p.bet, 0);
        const embed = EmbedBuilder.from(msg.embeds[0])
          .setColor(colorForMultiplier(mult))
          .setDescription(`**Multiplier:** ${mult.toFixed(2)}×\n${stylishBar(mult)}\n👥 **Players:** ${state.players.length} | 💰 **Pot:** ${totalPot.toLocaleString()} coins\n\nReact with ${CASHOUT_EMOJI} to **Cash Out**!`);
        const graphBuf = drawGraph(state.points, mult);
        const attachment = new AttachmentBuilder(graphBuf, { name: 'graph.png' });
        await msg.edit({ embeds: [embed], files: [attachment] }).catch(() => {});
      }, UPDATE_INTERVAL_MS);
    }
  }
}

// ---------- Command definition ----------
module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("rocket")
    .setDescription("Public Rocket crash game")
    .addSubcommand(sub =>
      sub.setName("setchannel")
        .setDescription("(Admin) Set the Rocket game channel")
        .addChannelOption(opt => opt.setName("channel").setDescription("Channel for rounds").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("join")
        .setDescription("Join the current betting round")
        .addStringOption(opt => opt.setName("bet").setDescription("Amount or 'all' (max 250,000)").setRequired(true))
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === "setchannel") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "❌ Admin only.", flags: MessageFlags.Ephemeral });
      const channel = interaction.options.getChannel("channel");
      await redis.set(`rocket:channel:${guildId}`, channel.id);
      stopLoop(guildId);
      const interval = setInterval(() => tick(guildId, client, redis), 1000);
      gameLoops.set(guildId, interval);
      await redis.del(`rocket:round:${guildId}`);
      await redis.del(`rocket:cooldown:${guildId}`);
      return interaction.reply({ content: `✅ Rocket channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === "join") {
      const channelId = await redis.get(`rocket:channel:${guildId}`);
      if (!channelId) return interaction.reply({ content: "❌ Rocket channel not set.", flags: MessageFlags.Ephemeral });
      if (!gameLoops.has(guildId)) {
        const interval = setInterval(() => tick(guildId, client, redis), 1000);
        gameLoops.set(guildId, interval);
      }
      if (await redis.get(`rocket:cooldown:${guildId}`))
        return interaction.reply({ content: "⏳ Round just ended. Next round soon.", flags: MessageFlags.Ephemeral });
      const raw = await redis.get(`rocket:round:${guildId}`);
      if (!raw) {
        const rNum = await redis.incr(`rocket:roundCounter:${guildId}`);
        const newRound = {
          phase: 'betting', bettingStart: Date.now(), crashPoint: getCrashPoint(),
          players: [], messages: [], roundNumber: rNum,
        };
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🚀 Rocket – Round #${rNum}`)
            .setDescription(`Betting is open! Use \`/rocket join <amount>\`.\nEnds <t:${Math.floor((Date.now() + BETTING_PHASE_SEC * 1000) / 1000)}:R>\n\nCrash range: **1.20× – 100.00×**`)
            .setFooter({ text: 'Place your bets…' });
          const msg = await channel.send({ embeds: [embed] });
          newRound.messages.push(msg.id);
        }
        await redis.set(`rocket:round:${guildId}`, JSON.stringify(newRound));
      }
      const round = JSON.parse(await redis.get(`rocket:round:${guildId}`));
      if (round.phase !== 'betting')
        return interaction.reply({ content: "❌ Betting phase is over.", flags: MessageFlags.Ephemeral });
      const userId = interaction.user.id;
      if (round.players.some(p => p.userId === userId))
        return interaction.reply({ content: "❌ You already joined.", flags: MessageFlags.Ephemeral });
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
      return interaction.reply({ content: `✅ Joined with **${bet.toLocaleString()}** coins. React with 🚀 on the flight message.`, flags: MessageFlags.Ephemeral });
    }
  }
};

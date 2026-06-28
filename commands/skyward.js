// commands/rocket.js – Smooth Rocket (moving bar, public rounds, reactions)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");

const MAX_BET = 250_000;
const BETTING_PHASE_SEC = 12;
const COOLDOWN_SEC = 6;
const CASHOUT_EMOJI = "🚀";
const UPDATE_INTERVAL_MS = 2000;   // 2 sec update – smooth & safe

// 🔥 Optional: replace with your custom animated rocket emoji (e.g., "<a:rocket_fly:123456789>")
// If you don't have one, leave "🚀" – the moving bar in the text will still look great.
const ROCKET_FLY_EMOJI = "🚀";

// ---------- Crash point ----------
function getCrashPoint() {
  const min = 1.20;
  const max = 100.00;
  return Math.min(max, min / (1 - Math.random()));
}

function multAt(elapsedSec) {
  return Math.exp(0.1 * elapsedSec);
}

// ---------- Moving rocket bar (shifts 🚀 based on multiplier) ----------
function rocketBar(mult) {
  const maxDisplay = 50.0;
  const ratio = Math.min(mult / maxDisplay, 1.0);
  const totalBlocks = 16;
  const pos = Math.floor(ratio * totalBlocks);
  let bar = '';
  bar += '🟩'.repeat(pos);
  bar += '🚀';
  bar += '⬛'.repeat(totalBlocks - pos - 1);
  return bar;
}

function colorForMultiplier(mult) {
  if (mult < 2.0) return '#00FF88';
  if (mult < 5.0) return '#FFD700';
  if (mult < 15.0) return '#FF8800';
  return '#FF0044';
}

// ---------- Game state ----------
const gameLoops = new Map();   // guildId → interval

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
      await redis.set(roundKey, JSON.stringify(round));
      await cleanChannel(channel, round.messages);
      round.messages = [];

      const totalPot = round.players.reduce((sum, p) => sum + p.bet, 0);
      // Embed with optional animated rocket emoji as image
      const embed = new EmbedBuilder()
        .setColor('#00FF88')
        .setTitle('🚀 Rocket – Live')
        .setDescription(
          `**Multiplier:** 1.00×\n${rocketBar(1.0)}\n` +
          `👥 **Players:** ${round.players.length} | 💰 **Pot:** ${totalPot.toLocaleString()} coins\n\n` +
          `React with ${CASHOUT_EMOJI} to **Cash Out**!`
        )
        .setFooter({ text: 'Cash out before it crashes!' });

      if (ROCKET_FLY_EMOJI !== '🚀') {
        embed.setImage(ROCKET_FLY_EMOJI);
      }

      const msg = await channel.send({ embeds: [embed] });
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
        const bal = Number(await redis.get(balanceKey) || 0) + player.payout;
        await redis.set(balanceKey, bal);

        try {
          const u = await client.users.fetch(user.id);
          await u.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('💰 Cashed Out!')
                .setDescription(`You cashed out at **${mult.toFixed(2)}×** and won **${player.payout.toLocaleString()}** coins!\nBet: ${player.bet.toLocaleString()} coins`)
            ]
          });
        } catch (e) {}
      });

      // Flight update loop (text‑only edits)
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
            if (p.cashedOut) {
              results += `<@${p.userId}> – **Cashed Out** at ${p.cashOutMultiplier.toFixed(2)}× (+${p.payout.toLocaleString()} coins)\n`;
            } else {
              results += `<@${p.userId}> – **Crashed** (lost ${p.bet.toLocaleString()} coins)\n`;
            }
          }

          const embed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle(`💥 Rocket Crashed! (Round #${state.roundNumber})`)
            .setDescription(`Crashed at **${mult.toFixed(2)}×**!\n\n**Results:**\n${results || 'No players'}`)
            .setFooter({ text: 'Next round starting soon…' });
          const m = await channel.send({ embeds: [embed] });
          setTimeout(() => m.delete().catch(() => {}), COOLDOWN_SEC * 1000);

          await redis.del(roundKey);
          await redis.set(`rocket:cooldown:${guildId}`, '1', 'EX', COOLDOWN_SEC);
          return;
        }

        // Update embed
        const msg = await channel.messages.fetch(state.flightMessageId).catch(() => null);
        if (!msg || !msg.embeds?.length) { clearInterval(flightInterval); await redis.del(roundKey); return; }

        const totalPot = state.players.reduce((sum, p) => sum + p.bet, 0);
        const embed = EmbedBuilder.from(msg.embeds[0])
          .setColor(colorForMultiplier(mult))
          .setDescription(
            `**Multiplier:** ${mult.toFixed(2)}×\n${rocketBar(mult)}\n` +
            `👥 **Players:** ${state.players.length} | 💰 **Pot:** ${totalPot.toLocaleString()} coins\n\n` +
            `React with ${CASHOUT_EMOJI} to **Cash Out**!`
          );
        // Keep the same image (if custom emoji) – do not change it
        await msg.edit({ embeds: [embed] }).catch(() => {});
      }, UPDATE_INTERVAL_MS);
    }
  }
}

// =============================================================================
// Command definition
// =============================================================================
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

      stopLoop(guildId);
      const interval = setInterval(() => tick(guildId, client, redis), 1000);
      gameLoops.set(guildId, interval);

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

      // Resume loop if paused
      if (!gameLoops.has(guildId)) {
        const interval = setInterval(() => tick(guildId, client, redis), 1000);
        gameLoops.set(guildId, interval);
      }

      if (await redis.get(`rocket:cooldown:${guildId}`))
        return interaction.reply({ content: "⏳ Round just ended. Next round soon.", flags: MessageFlags.Ephemeral });

      const raw = await redis.get(`rocket:round:${guildId}`);
      if (!raw) {
        // Create a fresh betting round immediately
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

      return interaction.reply({
        content: `✅ Joined with **${bet.toLocaleString()}** coins. React with 🚀 on the flight message.`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

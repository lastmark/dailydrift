// commands/rocket.js – Public per‑guild Rocket (up to 1000x, reaction cash‑out)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");

const MAX_BET = 250_000;
const BETTING_PHASE_SEC = 15;
const COOLDOWN_SEC = 10;
const CASHOUT_EMOJI = "🚀";

// ---------- Random crash point ----------
function getCrashPoint() {
  return 1.0 + Math.random() * 999.0;   // uniform 1.00–1000.00
}

function multAt(elapsedSec) {
  return Math.exp(0.1 * elapsedSec);
}

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

// ---------- Store game loops per guild ----------
const gameLoops = new Map();

// ---------- Main game tick ----------
async function tick(guildId, client, redis, channelId) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const roundKey = `rocket:round:${guildId}`;
  const now = Date.now();

  let round = await redis.get(roundKey);
  if (!round) {
    // Start betting
    round = {
      phase: 'betting',
      bettingStart: now,
      crashPoint: getCrashPoint(),
      players: [],
      flightMessageId: null,
      startTime: null
    };
    await redis.set(roundKey, JSON.stringify(round));
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🚀 Rocket – New Round')
      .setDescription(
        `Betting is open! Use \`/rocket join <amount>\`.\n` +
        `Betting ends <t:${Math.floor((now + BETTING_PHASE_SEC * 1000) / 1000)}:R>\n\n` +
        `Crash range: **1.00× – 1,000.00×** (completely random)`
      )
      .setFooter({ text: 'React with 🚀 to cash out when the flight starts' });
    await channel.send({ embeds: [embed] });
    return;
  }

  round = JSON.parse(round);

  if (round.phase === 'betting') {
    if (now - round.bettingStart >= BETTING_PHASE_SEC * 1000) {
      // Start flight
      round.phase = 'flight';
      round.startTime = now;
      await redis.set(roundKey, JSON.stringify(round));

      const embed = new EmbedBuilder()
        .setColor('#00FF88')
        .setTitle('🚀 Rocket – Round Started!')
        .setDescription(
          `**Multiplier: 1.00×**\n${rocketBar(1.0)}\n` +
          `${round.players.length} player(s) in.\nReact with ${CASHOUT_EMOJI} to **Cash Out**!`
        )
        .setFooter({ text: 'The rocket is taking off...' });

      const msg = await channel.send({ embeds: [embed] });
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
        if (mult >= state.crashPoint) return; // crash

        player.cashedOut = true;
        player.payout = Math.floor(player.bet * mult);
        player.cashOutMultiplier = mult;
        await redis.set(roundKey, JSON.stringify(state));

        const balanceKey = `eco:${user.id}:money`;
        const bal = Number(await redis.get(balanceKey) || 0);
        await redis.set(balanceKey, bal + player.payout);
      });
    }
  }
  else if (round.phase === 'flight') {
    const elapsed = (Date.now() - round.startTime) / 1000;
    const mult = multAt(elapsed);

    if (mult >= round.crashPoint) {
      // Crash
      const channel = client.channels.cache.get(channelId);
      if (channel && round.flightMessageId) {
        const msg = await channel.messages.fetch(round.flightMessageId).catch(() => null);
        if (msg) {
          const crashEmbed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('💥 Rocket Crashed!')
            .setDescription(`The rocket crashed at **${mult.toFixed(2)}×**!\n\n**Results:**`);
          let results = '';
          for (const p of round.players) {
            if (p.cashedOut) {
              results += `<@${p.userId}> – **Cashed Out** at ${p.cashOutMultiplier.toFixed(2)}× (+${p.payout.toLocaleString()} coins)\n`;
            } else {
              results += `<@${p.userId}> – **Crashed** (lost ${p.bet.toLocaleString()} coins)\n`;
            }
          }
          crashEmbed.setDescription(`The rocket crashed at **${mult.toFixed(2)}×**!\n\n**Results:**\n${results || 'No players'}`);
          await msg.edit({ embeds: [crashEmbed] }).catch(() => {});
          await msg.reactions.removeAll().catch(() => {});
        }
      }
      // Cleanup round
      await redis.del(roundKey);
      // Wait cooldown then restart betting automatically (next tick will create a new round)
      // But we need to ensure the next round doesn't start immediately; we'll add a cooldown flag.
      // Actually, the next tick will see no round and start a new betting phase immediately.
      // So we need to implement cooldown. I'll set a cooldown key.
      await redis.set(`rocket:cooldown:${guildId}`, '1', 'EX', COOLDOWN_SEC);
    } else {
      // Update flight message
      const channel = client.channels.cache.get(channelId);
      if (channel && round.flightMessageId) {
        const msg = await channel.messages.fetch(round.flightMessageId).catch(() => null);
        if (msg) {
          const embed = new EmbedBuilder()
            .setColor(colorForMultiplier(mult))
            .setTitle('🚀 Rocket – Live')
            .setDescription(
              `**Multiplier: ${mult.toFixed(2)}×**\n${rocketBar(mult)}\n` +
              `${round.players.length} player(s) in.\nReact with ${CASHOUT_EMOJI} to **Cash Out**!`
            )
            .setFooter({ text: 'Cash out before it crashes!' });
          await msg.edit({ embeds: [embed] }).catch(() => {});
        }
      }
    }
  }
}

// ---------- Command definition ----------
module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("rocket")
    .setDescription("Public Rocket game")
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
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Administrator permission required.", flags: MessageFlags.Ephemeral });
      }
      const channel = interaction.options.getChannel("channel");
      await redis.set(`rocket:channel:${guildId}`, channel.id);

      // Clear existing game loop
      if (gameLoops.has(guildId)) {
        clearInterval(gameLoops.get(guildId));
        gameLoops.delete(guildId);
      }
      // Start the tick interval
      const interval = setInterval(() => tick(guildId, client, redis, channel.id), 1000);
      gameLoops.set(guildId, interval);

      // Delete any existing round so a fresh one starts
      await redis.del(`rocket:round:${guildId}`);
      await redis.del(`rocket:cooldown:${guildId}`);

      return interaction.reply({ content: `✅ Rocket channel set to ${channel}. First round will start automatically.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === "join") {
      const channelId = await redis.get(`rocket:channel:${guildId}`);
      if (!channelId) {
        return interaction.reply({ content: "❌ Rocket channel not set. An admin must use `/rocket setchannel`.", flags: MessageFlags.Ephemeral });
      }

      // Check cooldown
      const cooldown = await redis.get(`rocket:cooldown:${guildId}`);
      if (cooldown) {
        return interaction.reply({ content: "⏳ The next round is about to start. Please wait a moment.", flags: MessageFlags.Ephemeral });
      }

      const roundKey = `rocket:round:${guildId}`;
      const raw = await redis.get(roundKey);
      if (!raw) {
        return interaction.reply({ content: "❌ No active round. Wait for the next one.", flags: MessageFlags.Ephemeral });
      }
      const round = JSON.parse(raw);
      if (round.phase !== 'betting') {
        return interaction.reply({ content: "❌ Betting phase is over. Wait for the next round.", flags: MessageFlags.Ephemeral });
      }

      const userId = interaction.user.id;
      const betRaw = interaction.options.getString("bet").toLowerCase();
      let bet;
      const balanceKey = `eco:${userId}:money`;
      const bal = Number(await redis.get(balanceKey) || 0);

      if (betRaw === "all") {
        bet = Math.min(bal, MAX_BET);
        if (bet <= 0) return interaction.reply({ content: "❌ You have no coins.", flags: MessageFlags.Ephemeral });
      } else {
        bet = parseInt(betRaw);
        if (isNaN(bet) || bet < 1) return interaction.reply({ content: "❌ Invalid amount.", flags: MessageFlags.Ephemeral });
        if (bet > MAX_BET) bet = MAX_BET;
      }
      if (bal < bet) return interaction.reply({ content: `❌ You need **${bet.toLocaleString()}** coins.`, flags: MessageFlags.Ephemeral });

      // Check if already in round
      if (round.players.some(p => p.userId === userId)) {
        return interaction.reply({ content: "❌ You've already joined this round.", flags: MessageFlags.Ephemeral });
      }

      // Deduct bet immediately
      await redis.set(balanceKey, bal - bet);
      round.players.push({ userId, bet, cashedOut: false });
      await redis.set(roundKey, JSON.stringify(round));

      return interaction.reply({ content: `✅ Joined with **${bet.toLocaleString()}** coins! React with 🚀 on the flight message to cash out.`, flags: MessageFlags.Ephemeral });
    }
  }
};

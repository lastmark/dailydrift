// commands/rocket.js – Premium Components V2 Rocket (Crash) Game
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder
} = require("discord.js");

const MAX_BET = 250_000;
const BETTING_PHASE_SEC = 12;
const COOLDOWN_SEC = 6;
const UPDATE_INTERVAL_MS = 2000; 

// ---------- Crash Point Algorithm ----------
function getCrashPoint() {
  const min = 1.20;
  const max = 100.00;
  return Math.min(max, min / (1 - Math.random()));
}

function multAt(elapsedSec) {
  return Math.exp(0.08 * elapsedSec);
}

// ---------- Premium Color Progression Line ----------
function colorForMultiplier(mult) {
  if (mult < 2.0) return 0x00FF88;   // Emerald green
  if (mult < 5.0) return '#FFD700';   // Aesthetic gold
  if (mult < 15.0) return 0xFF8800;  // Gritty orange
  return 0xFF0044;                   // Cinematic red
}

// ---------- Modern Horizontal Progress Tracker ----------
function rocketBar(mult) {
  const maxDisplay = 30.0;
  const ratio = Math.min(mult / maxDisplay, 1.0);
  const totalBlocks = 14;
  const pos = Math.floor(ratio * totalBlocks);
  
  let bar = '';
  bar += '🟩'.repeat(pos);
  bar += '🚀';
  bar += '⬛'.repeat(Math.max(0, totalBlocks - pos - 1));
  return bar;
}

const gameLoops = new Map();

function stopLoop(guildId) {
  if (gameLoops.has(guildId)) {
    clearInterval(gameLoops.get(guildId));
    gameLoops.delete(guildId);
  }
}

// ---------- Main Game Loop Engine Tick ----------
async function tick(guildId, client, redis) {
  const channelId = await redis.get(`rocket:channel:${guildId}`);
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const roundKey = `rocket:round:${guildId}`;
  const now = Date.now();
  let roundRaw = await redis.get(roundKey);

  // 1. Initial State: Setup and Open Betting Phase
  if (!roundRaw) {
    const rNum = await redis.incr(`rocket:roundCounter:${guildId}`);
    const round = {
      phase: 'betting',
      bettingStart: now,
      crashPoint: getCrashPoint(),
      players: [],
      roundNumber: rNum,
      flightMessageId: null
    };
    await redis.set(roundKey, JSON.stringify(round));

    const textContent = [
      `🛸 **Rocket Multiplier – Round #${rNum}**`,
      `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`,
      `💰 **Betting is now open!**`,
      `Use \`/rocket join <amount>\` to hop on board.`,
      ``,
      `⏱️ **Launch window closes:** <t:${Math.floor((now + BETTING_PHASE_SEC * 1000) / 1000)}:R>`,
      `📈 **Expected Multiplier Limits:** \`1.20x\` – \`100.00x\``
    ].join("\n");

    const textBlock = new TextDisplayBuilder().setContent(textContent);
    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(textBlock);

    const msg = await channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });

    round.flightMessageId = msg.id;
    await redis.set(roundKey, JSON.stringify(round));
    return;
  }

  let round = JSON.parse(roundRaw);

  // 2. Flight State Transition: Execute Rocket Flight Launch
  if (round.phase === 'betting') {
    if (now - round.bettingStart >= BETTING_PHASE_SEC * 1000) {
      if (round.players.length === 0) {
        // Void round cleanly if nobody shows up
        const targetMsg = await channel.messages.fetch(round.flightMessageId).catch(() => null);
        if (targetMsg) await targetMsg.delete().catch(() => {});
        await redis.del(roundKey);
        stopLoop(guildId);
        return;
      }

      round.phase = 'flight';
      round.startTime = now;
      await redis.set(roundKey, JSON.stringify(round));

      // Build initial launcher template view
      const updatedPayload = buildV2FlightPanel(round, 1.0);
      const targetMsg = await channel.messages.fetch(round.flightMessageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit(updatedPayload).catch(() => {});
      }

      // Initialize the live high-speed tracker updates
      const flightInterval = setInterval(async () => {
        const liveRaw = await redis.get(roundKey);
        if (!liveRaw) { clearInterval(flightInterval); return; }
        
        const state = JSON.parse(liveRaw);
        if (state.phase !== 'flight') { clearInterval(flightInterval); return; }

        const elapsed = (Date.now() - state.startTime) / 1000;
        const currentMult = multAt(elapsed);

        // ---- CRASH STATE EVENT ----
        if (currentMult >= state.crashPoint) {
          clearInterval(flightInterval);
          state.phase = 'crashed';
          await redis.set(roundKey, JSON.stringify(state));

          let resultsLog = '';
          for (const p of state.players) {
            if (p.cashedOut) {
              resultsLog += `🟢 <@${p.userId}> • **Won** \`${p.payout.toLocaleString()}\` coins (${p.cashOutMultiplier.toFixed(2)}x)\n`;
            } else {
              resultsLog += `🔴 <@${p.userId}> • **Crashed** (lost \`${p.bet.toLocaleString()}\` coins)\n`;
            }
          }

          const crashContent = [
            `💥 **ROCKET CRASHED! (Round #${state.roundNumber})**`,
            `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`,
            `💀 **Exploded at:** \`${state.crashPoint.toFixed(2)}x\``,
            ``,
            `📋 **Flight Crew Manifest Results:**`,
            resultsLog || '*No active players made it into orbit.*'
          ].join("\n");

          const textBlock = new TextDisplayBuilder().setContent(crashContent);
          const container = new ContainerBuilder()
            .setAccentColor(0xFF0044)
            .addTextDisplayComponents(textBlock);

          const liveMsg = await channel.messages.fetch(state.flightMessageId).catch(() => null);
          if (liveMsg) {
            await liveMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            setTimeout(() => liveMsg.delete().catch(() => {}), COOLDOWN_SEC * 1000);
          }

          await redis.del(roundKey);
          await redis.set(`rocket:cooldown:${guildId}`, '1', 'EX', COOLDOWN_SEC);
          return;
        }

        // ---- LIVE CONTINUOUS UPDATE TICK ----
        const liveMsg = await channel.messages.fetch(state.flightMessageId).catch(() => null);
        if (!liveMsg) { clearInterval(flightInterval); await redis.del(roundKey); return; }

        await liveMsg.edit(buildV2FlightPanel(state, currentMult)).catch(() => {});
      }, UPDATE_INTERVAL_MS);
    }
  }
}

// ---- Layout Renderer Engine For Active Flights ----
function buildV2FlightPanel(state, currentMult) {
  const totalPot = state.players.reduce((sum, p) => sum + p.bet, 0);

  let passengerStatus = '';
  for (const p of state.players) {
    if (p.cashedOut) {
      passengerStatus += `✅ <@${p.userId}> safe (${p.cashOutMultiplier.toFixed(2)}x)\n`;
    } else {
      passengerStatus += `🚀 <@${p.userId}> cruising (\`${Math.floor(p.bet * currentMult).toLocaleString()}\` value)\n`;
    }
  }

  const flightContent = [
    `⚡ **ROCKET IN FLIGHT**`,
    `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`,
    `📈 **Current Velocity:** \`${currentMult.toFixed(2)}x\``,
    `${rocketBar(currentMult)}`,
    ``,
    `💰 **Total Pool Risked:** \`${totalPot.toLocaleString()}\` coins`,
    ``,
    `👥 **Crew Status:**`,
    passengerStatus
  ].join("\n");

  const textBlock = new TextDisplayBuilder().setContent(flightContent);
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("rocket_cashout_trigger")
      .setLabel("Eject / Cash Out")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🚀")
      .setDisabled(state.phase !== 'flight')
  );

  const container = new ContainerBuilder()
    .setAccentColor(colorForMultiplier(currentMult))
    .addTextDisplayComponents(textBlock)
    .addActionRowComponents(actionRow);

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

// =============================================================================
// Command Architecture Config
// =============================================================================
module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("rocket")
    .setDescription("Public Rocket cash game")
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

    // Handle Channel Management Settings System
    if (sub === "setchannel") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "❌ Administrator clearance required.", flags: MessageFlags.Ephemeral });

      const channel = interaction.options.getChannel("channel");
      await redis.set(`rocket:channel:${guildId}`, channel.id);

      stopLoop(guildId);
      const interval = setInterval(() => tick(guildId, client, redis), 1000);
      gameLoops.set(guildId, interval);

      await redis.del(`rocket:round:${guildId}`);
      await redis.del(`rocket:cooldown:${guildId}`);

      return interaction.reply({
        content: `✅ Rocket console configured to send games in ${channel}.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Handle Active Flight Core Signup System
    if (sub === "join") {
      const channelId = await redis.get(`rocket:channel:${guildId}`);
      if (!channelId)
        return interaction.reply({ content: "❌ Setup incomplete. Admin must run \`/rocket setchannel\` first.", flags: MessageFlags.Ephemeral });

      // Auto-restart polling thread loops if down
      if (!gameLoops.has(guildId)) {
        const interval = setInterval(() => tick(guildId, client, redis), 1000);
        gameLoops.set(guildId, interval);
      }

      if (await redis.get(`rocket:cooldown:${guildId}`))
        return interaction.reply({ content: "⏳ Preparing the next booster rocket. Standby.", flags: MessageFlags.Ephemeral });

      let roundRaw = await redis.get(`rocket:round:${guildId}`);
      
      // Build immediate betting module if loop hasn't woken up
      if (!roundRaw) {
        await tick(guildId, client, redis);
        roundRaw = await redis.get(`rocket:round:${guildId}`);
      }

      const round = JSON.parse(roundRaw);
      if (round.phase !== 'betting')
        return interaction.reply({ content: "❌ Launcher gates closed! The rocket is already airborne.", flags: MessageFlags.Ephemeral });

      const userId = interaction.user.id;
      if (round.players.some(p => p.userId === userId))
        return interaction.reply({ content: "❌ You have already reserved a seat on this rocket.", flags: MessageFlags.Ephemeral });

      const betRaw = interaction.options.getString("bet").toLowerCase();
      let bet;
      const balanceKey = `eco:${userId}:money`;
      const bal = Number(await redis.get(balanceKey) || 0);

      if (betRaw === "all") {
        bet = Math.min(bal, MAX_BET);
        if (bet <= 0) return interaction.reply({ content: "❌ Vault is empty. You have 0 coins.", flags: MessageFlags.Ephemeral });
      } else {
        bet = parseInt(betRaw);
        if (isNaN(bet) || bet < 1) return interaction.reply({ content: "❌ Invalid ledger balance transaction request.", flags: MessageFlags.Ephemeral });
        if (bet > MAX_BET) bet = MAX_BET;
      }
      if (bal < bet) return interaction.reply({ content: `❌ Insufficient coins. Required: **${bet.toLocaleString()}**`, flags: MessageFlags.Ephemeral });

      // Process Wager Deductions securely
      await redis.set(balanceKey, bal - bet);
      round.players.push({ userId, bet, cashedOut: false, payout: 0, cashOutMultiplier: 0 });
      await redis.set(`rocket:round:${guildId}`, JSON.stringify(round));

      return interaction.reply({
        content: `✅ Successfully checked in with **${bet.toLocaleString()}** coins. Watch the terminal display below to cash out!`,
        flags: MessageFlags.Ephemeral
      });
    }
  },

  // =============================================================================
  // High-Performance Global Interaction Controller Router
  // =============================================================================
  async handleButton(interaction, redis, client) {
    if (interaction.customId !== "rocket_cashout_trigger") return;

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const roundKey = `rocket:round:${guildId}`;

    const raw = await redis.get(roundKey);
    if (!raw) return interaction.reply({ content: "⚠️ System offline or round terminated.", flags: MessageFlags.Ephemeral });

    const state = JSON.parse(raw);
    if (state.phase !== 'flight') return interaction.reply({ content: "❌ Rocket is not currently in flight.", flags: MessageFlags.Ephemeral });

    const player = state.players.find(p => p.userId === userId);
    if (!player) return interaction.reply({ content: "❌ You aren't riding this rocket!", flags: MessageFlags.Ephemeral });
    if (player.cashedOut) return interaction.reply({ content: "⚠️ You already ejected safely!", flags: MessageFlags.Ephemeral });

    const elapsed = (Date.now() - state.startTime) / 1000;
    const currentMult = multAt(elapsed);

    // Safeguard check to ensure they didn't push it exactly during a crash frame
    if (currentMult >= state.crashPoint) return interaction.reply({ content: "💥 Too late! The rocket erupted into flames.", flags: MessageFlags.Ephemeral });

    // Mark safe and compute financial transfers
    player.cashedOut = true;
    player.cashOutMultiplier = currentMult;
    player.payout = Math.floor(player.bet * currentMult);

    await redis.set(roundKey, JSON.stringify(state));

    const balanceKey = `eco:${userId}:money`;
    const userBalance = Number(await redis.get(balanceKey) || 0);
    await redis.set(balanceKey, userBalance + player.payout);

    // Dynamic feedback to clear button process interaction pipelines cleanly
    await interaction.reply({
      content: `🏆 **Ejected Safely!** You cashed out at **${currentMult.toFixed(2)}x** and pocketed **${player.payout.toLocaleString()}** coins!`,
      flags: MessageFlags.Ephemeral
    });
  }
};

// commands/rocket.js – Reaction‑based Rocket (no buttons)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

const MAX_BET = 250_000;
const SPEED = 0.1;                // multiplier = exp(SPEED * t)
const CASHOUT_EMOJI = "🚀";      // react with this to cash out

// ---------- Crash point distribution ----------
function getCrashPoint() {
  const r = Math.random() * 100;
  if (r < 30) return 1.0 + Math.random() * 0.5;
  if (r < 60) return 1.5 + Math.random() * 1.0;
  if (r < 80) return 2.5 + Math.random() * 2.5;
  if (r < 95) return 5.0 + Math.random() * 10.0;
  if (r < 99) return 15.0 + Math.random() * 85.0;
  return 100.0 + Math.random() * 400.0;
}

function multAt(elapsedSec) {
  return Math.exp(SPEED * elapsedSec);
}

// Rocket bar (same as before)
function rocketBar(mult) {
  const maxDisplay = 10.0;
  const pos = Math.min(mult / maxDisplay, 1.0);
  const barLength = 20;
  const filled = Math.floor(pos * barLength);
  const empty = barLength - filled - 1;
  if (filled <= 0) return `🚀${'▬'.repeat(barLength - 1)}`;
  if (filled >= barLength) return `${'▬'.repeat(barLength - 1)}🚀`;
  return `${'▬'.repeat(filled - 1)}🚀${'▬'.repeat(empty)}`;
}

function colorForMultiplier(mult) {
  if (mult < 1.5) return '#00FF88';
  if (mult < 2.5) return '#FFD700';
  if (mult < 5.0) return '#FF8800';
  return '#FF0044';
}

module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("rocket")
    .setDescription("Play a private round of Rocket – cash out before it crashes!")
    .addStringOption(opt =>
      opt.setName("bet")
        .setDescription("Amount to bet, or 'all' (max 250,000)")
        .setRequired(true)
    ),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const betRaw = interaction.options.getString("bet").toLowerCase();
    let bet;

    const balanceKey = `eco:${userId}:money`;
    const currentBal = Number(await redis.get(balanceKey) || 0);

    // ---------- Parse bet ----------
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

    // Prevent double rounds
    const active = await redis.get(`rocket:${userId}`);
    if (active) {
      return interaction.reply({ content: "❌ You already have an active Rocket game.", flags: MessageFlags.Ephemeral });
    }

    // Deduct bet
    await redis.set(balanceKey, currentBal - bet);

    // Generate secret crash point and save state
    const crashPoint = getCrashPoint();
    const startTime = Date.now();
    const state = {
      bet,
      crashPoint,
      startTime,
      status: "playing",
    };
    await redis.set(`rocket:${userId}`, JSON.stringify(state));

    // Initial embed – tell user to react with 🚀
    const embed = new EmbedBuilder()
      .setColor('#00FF88')
      .setTitle('🚀 Rocket')
      .setDescription(
        `Multiplier: **1.00×**\n` +
        `${rocketBar(1.0)}\n` +
        `Bet: ${bet.toLocaleString()} coins\n\n` +
        `React with ${CASHOUT_EMOJI} to **Cash Out**!`
      )
      .setFooter({ text: 'The longer you wait, the higher the risk...' });

    await interaction.deferReply();
    const message = await interaction.editReply({ embeds: [embed] });
    await message.react(CASHOUT_EMOJI).catch(() => {});

    // ---------- Game loop (update embed every second) ----------
    const interval = setInterval(async () => {
      const raw = await redis.get(`rocket:${userId}`);
      if (!raw) {
        clearInterval(interval);
        return;
      }
      const currentState = JSON.parse(raw);
      if (currentState.status !== "playing") {
        clearInterval(interval);
        return;
      }

      const elapsed = (Date.now() - currentState.startTime) / 1000;
      const mult = multAt(elapsed);

      if (mult >= currentState.crashPoint) {
        // Crashed
        currentState.status = "crashed";
        await redis.set(`rocket:${userId}`, JSON.stringify(currentState));
        clearInterval(interval);

        const crashEmbed = EmbedBuilder.from(embed)
          .setColor('#ED4245')
          .setTitle('💥 Rocket Crashed!')
          .setDescription(
            `Multiplier reached **${mult.toFixed(2)}×** but the rocket crashed!\n` +
            `You lost **${bet.toLocaleString()}** coins.`
          )
          .setFooter({ text: 'Better luck next time!' });

        await message.edit({ embeds: [crashEmbed] }).catch(() => {});
        await message.reactions.removeAll().catch(() => {});
        await redis.del(`rocket:${userId}`);
      } else {
        // Update embed
        const updatedEmbed = EmbedBuilder.from(embed)
          .setColor(colorForMultiplier(mult))
          .setDescription(
            `Multiplier: **${mult.toFixed(2)}×**\n` +
            `${rocketBar(mult)}\n` +
            `Bet: ${bet.toLocaleString()} coins\n\n` +
            `React with ${CASHOUT_EMOJI} to **Cash Out**!`
          );
        await message.edit({ embeds: [updatedEmbed] }).catch(() => {});
      }
    }, 1000);

    // ---------- Reaction collector for Cash Out ----------
    const filter = (reaction, user) =>
      reaction.emoji.name === CASHOUT_EMOJI && user.id === userId;

    const collector = message.createReactionCollector({
      filter,
      time: 600_000,     // max 10 minutes (but game will crash earlier)
    });

    collector.on("collect", async (reaction, user) => {
      // Remove the user's reaction so they can't accidentally trigger twice
      await reaction.users.remove(user).catch(() => {});

      const raw = await redis.get(`rocket:${userId}`);
      if (!raw) {
        collector.stop();
        return;
      }
      const currentState = JSON.parse(raw);
      if (currentState.status !== "playing") return;

      const elapsed = (Date.now() - currentState.startTime) / 1000;
      const mult = multAt(elapsed);

      if (mult >= currentState.crashPoint) {
        // Crashed at the exact moment – treat as loss
        currentState.status = "crashed";
        await redis.set(`rocket:${userId}`, JSON.stringify(currentState));
        clearInterval(interval);
        collector.stop();

        await message.edit({
          content: "💥 The rocket crashed as you tried to cash out!",
          embeds: [],
          components: [],
        }).catch(() => {});
        await message.reactions.removeAll().catch(() => {});
        await redis.del(`rocket:${userId}`);
        return;
      }

      // Successful cash out
      currentState.status = "cashed_out";
      await redis.set(`rocket:${userId}`, JSON.stringify(currentState));
      clearInterval(interval);
      collector.stop();

      const payout = Math.floor(bet * mult);
      const newBal = Number(await redis.get(balanceKey) || 0) + payout;
      await redis.set(balanceKey, newBal);

      const cashEmbed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('💰 Cashed Out!')
        .setDescription(
          `You cashed out at **${mult.toFixed(2)}×** and won **${payout.toLocaleString()}** coins!\n` +
          `Bet: ${bet.toLocaleString()} coins`
        )
        .setFooter({ text: 'Well played!' });

      await message.edit({ embeds: [cashEmbed] }).catch(() => {});
      await message.reactions.removeAll().catch(() => {});
      await redis.del(`rocket:${userId}`);
    });

    collector.on("end", (collected, reason) => {
      // If the game is still running and the collector ends (timeout), force a crash?
      // But the interval will handle it anyway. We'll just clear the interval.
      clearInterval(interval);
    });
  }
};

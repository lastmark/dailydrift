// commands/rocket.js – Private Rocket crash game (reliable, visual)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const MAX_BET = 250_000;
const SPEED = 0.1;               // multiplier = exp(SPEED * t)

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

// ---------- Rocket progress bar ----------
function rocketBar(mult) {
  const maxDisplay = 10.0;        // 10x = full bar
  const pos = Math.min(mult / maxDisplay, 1.0);
  const barLength = 20;
  const filled = Math.floor(pos * barLength);
  const empty = barLength - filled - 1;   // -1 for the rocket
  if (filled <= 0) return `🚀${'▬'.repeat(barLength - 1)}`;
  if (filled >= barLength) return `${'▬'.repeat(barLength - 1)}🚀`;
  return `${'▬'.repeat(filled - 1)}🚀${'▬'.repeat(empty)}`;
}

// ---------- Embed color based on multiplier ----------
function colorForMultiplier(mult) {
  if (mult < 1.5) return '#00FF88';   // green
  if (mult < 2.5) return '#FFD700';   // yellow
  if (mult < 5.0) return '#FF8800';   // orange
  return '#FF0044';                    // red
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

    // Initial embed
    const embed = new EmbedBuilder()
      .setColor('#00FF88')
      .setTitle('🚀 Rocket')
      .setDescription(`Multiplier: **1.00×**\n${rocketBar(1.0)}\nBet: ${bet.toLocaleString()} coins\n\nPress **Cash Out** to secure your winnings!`)
      .setFooter({ text: 'The longer you wait, the higher the risk...' });

    const cashOutBtn = new ButtonBuilder()
      .setCustomId("rocket_cashout")
      .setLabel("Cash Out")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(cashOutBtn);

    await interaction.deferReply();
    const message = await interaction.editReply({ embeds: [embed], components: [row] });

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
          .setDescription(`Multiplier reached **${mult.toFixed(2)}×** but the rocket crashed!\nYou lost **${bet.toLocaleString()}** coins.`)
          .setFooter({ text: 'Better luck next time!' });

        await message.edit({ embeds: [crashEmbed], components: [] }).catch(() => {});
        await redis.del(`rocket:${userId}`);
      } else {
        // Update embed
        const updatedEmbed = EmbedBuilder.from(embed)
          .setColor(colorForMultiplier(mult))
          .setDescription(`Multiplier: **${mult.toFixed(2)}×**\n${rocketBar(mult)}\nBet: ${bet.toLocaleString()} coins\n\nPress **Cash Out** to secure your winnings!`);
        await message.edit({ embeds: [updatedEmbed], components: [row] }).catch(() => {});
      }
    }, 1000);

    // ---------- Cash Out button collector ----------
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === userId && i.customId === "rocket_cashout",
      time: 600_000,
    });

    collector.on("collect", async (btnInteraction) => {
      const raw = await redis.get(`rocket:${userId}`);
      if (!raw) {
        await btnInteraction.reply({ content: "❌ Game not found.", flags: MessageFlags.Ephemeral });
        return;
      }
      const currentState = JSON.parse(raw);
      if (currentState.status !== "playing") {
        await btnInteraction.reply({ content: "❌ This round is already over.", flags: MessageFlags.Ephemeral });
        return;
      }

      const elapsed = (Date.now() - currentState.startTime) / 1000;
      const mult = multAt(elapsed);

      if (mult >= currentState.crashPoint) {
        // Race condition: crashed just before click → treat as crash
        currentState.status = "crashed";
        await redis.set(`rocket:${userId}`, JSON.stringify(currentState));
        clearInterval(interval);
        collector.stop();
        await redis.del(`rocket:${userId}`);
        await btnInteraction.update({ content: "💥 Crashed! You lost.", embeds: [], components: [] }).catch(() => {});
        return;
      }

      // Cash out
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
        .setDescription(`You cashed out at **${mult.toFixed(2)}×** and won **${payout.toLocaleString()}** coins!\nBet: ${bet.toLocaleString()} coins`)
        .setFooter({ text: 'Well played!' });

      await btnInteraction.update({ embeds: [cashEmbed], components: [] }).catch(() => {});
      await redis.del(`rocket:${userId}`);
    });

    collector.on("end", () => {
      clearInterval(interval);
    });
  }
};

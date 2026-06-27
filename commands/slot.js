// commands/slots.js – Best Style Slots (animated embed, custom spinner emoji)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

const MAX_BET = 250_000;
const SYMBOLS = ["🍎", "🍊", "🍋", "🍇", "🍒", "🍓"];

// 🔥 Replace with your animated spinner emoji (e.g. "<a:slot_spin:123456789>")
// If you don't have one, leave "🔄" – it still looks clean.
const SLOT_SPIN_EMOJI = "<a:slot:1520527576186097845>";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------- Same fair odds as OwO ----------
function getOutcome(bet) {
  const r = Math.random() * 100;
  if (r <= 20) {
    return { multiplier: 1, symbols: [SYMBOLS[0], SYMBOLS[0], SYMBOLS[0]], winText: "Even money! You get your bet back." };
  } else if (r <= 40) {
    return { multiplier: 2, symbols: [SYMBOLS[1], SYMBOLS[1], SYMBOLS[1]], winText: "Double up!" };
  } else if (r <= 45) {
    return { multiplier: 3, symbols: [SYMBOLS[2], SYMBOLS[2], SYMBOLS[2]], winText: "Triple win!" };
  } else if (r <= 47.5) {
    return { multiplier: 4, symbols: [SYMBOLS[3], SYMBOLS[3], SYMBOLS[3]], winText: "Big win! 4x!" };
  } else if (r <= 48.5) {
    return { multiplier: 10, symbols: [SYMBOLS[4], SYMBOLS[5], SYMBOLS[4]], winText: "JACKPOT! 10x!" };
  } else {
    // LOSS – random non‑matching set
    const a = Math.floor(Math.random() * SYMBOLS.length);
    let b = Math.floor(Math.random() * SYMBOLS.length);
    if (b === a) b = (a + Math.ceil(Math.random() * (SYMBOLS.length - 2))) % SYMBOLS.length;
    let c = Math.floor(Math.random() * SYMBOLS.length);
    if (c === a) c = (a + Math.ceil(Math.random() * (SYMBOLS.length - 2))) % SYMBOLS.length;
    return { multiplier: 0, symbols: [SYMBOLS[a], SYMBOLS[b], SYMBOLS[c]], winText: "No luck..." };
  }
}

module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Spin the slot machine!")
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

    // ---- Prevent double spins ----
    const lockKey = `slots:lock:${userId}`;
    if (await redis.get(lockKey)) {
      return interaction.reply({ content: "⏳ You already have a spin in progress.", flags: MessageFlags.Ephemeral });
    }
    await redis.set(lockKey, "1", "EX", 5);   // lock for 5 seconds

    // Deduct bet
    await redis.set(balanceKey, currentBal - bet);

    // Generate outcome
    const { multiplier, symbols, winText } = getOutcome(bet);
    const payout = bet * multiplier;

    // ---- Animate with stylish embeds ----
    await interaction.deferReply();

    const spin = SLOT_SPIN_EMOJI;
    const baseEmbed = () => new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🎰 SLOTS")
      .setFooter({ text: `Bet: ${bet.toLocaleString()} coins` });

    // Frame 1 – all spinning
    await interaction.editReply({
      embeds: [
        baseEmbed()
          .setDescription(`\`[ ${spin} │ ${spin} │ ${spin} ]\``)
          .setFooter({ text: `Bet: ${bet.toLocaleString()} coins · Spinning...` })
      ]
    });
    await sleep(1000);

    // Frame 2 – first reel stops
    await interaction.editReply({
      embeds: [
        baseEmbed()
          .setDescription(`\`[ ${symbols[0]} │ ${spin} │ ${spin} ]\``)
          .setFooter({ text: `Bet: ${bet.toLocaleString()} coins · Spinning...` })
      ]
    });
    await sleep(700);

    // Frame 3 – third reel stops
    await interaction.editReply({
      embeds: [
        baseEmbed()
          .setDescription(`\`[ ${symbols[0]} │ ${spin} │ ${symbols[2]} ]\``)
          .setFooter({ text: `Bet: ${bet.toLocaleString()} coins · Almost there...` })
      ]
    });
    await sleep(1000);

    // Frame 4 – all stop, show result
    let resultColor, resultText;
    if (multiplier === 0) {
      resultColor = "#ED4245";
      resultText = `You lost **${bet.toLocaleString()}** coins.\n${winText}`;
    } else if (multiplier === 10) {
      resultColor = "#FFD700";
      resultText = `🎉 **JACKPOT!** You won **${payout.toLocaleString()}** coins!\n${winText}`;
    } else {
      resultColor = "#57F287";
      resultText = `You won **${payout.toLocaleString()}** coins!\n${winText}`;
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(resultColor)
          .setTitle("🎰 SLOTS")
          .setDescription(`\`[ ${symbols[0]} │ ${symbols[1]} │ ${symbols[2]} ]\`\n\n${resultText}`)
          .setFooter({ text: `Bet: ${bet.toLocaleString()} coins` })
      ]
    });

    // Update balance (add payout)
    if (payout > 0) {
      const newBal = Number(await redis.get(balanceKey) || 0) + payout;
      await redis.set(balanceKey, newBal);
    }

    // Remove lock
    await redis.del(lockKey);
  }
};

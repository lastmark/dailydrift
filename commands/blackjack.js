// commands/blackjack.js – Reaction-based, "all" bet, dealer visible value
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");
const path = require("path");
const fs = require("fs");

// Load card emojis
let cardEmojis = {};
try {
  const cardsPath = path.join(__dirname, "../cards.json");
  if (fs.existsSync(cardsPath)) {
    cardEmojis = JSON.parse(fs.readFileSync(cardsPath, "utf-8"));
  }
} catch (err) {
  console.error("Error loading cards.json:", err);
}

const MAX_BET = 250_000;
const HIT_EMOJI = "👊";
const STAND_EMOJI = "🛑";

function cardValue(cardNumber) {
  const rank = (cardNumber - 1) % 13;
  if (rank === 0) return { soft: 11, hard: 1 };
  if (rank >= 9) return { soft: 10, hard: 10 };
  return { soft: rank + 1, hard: rank + 1 };
}

function bestHandValue(cards) {
  let total = 0, aces = 0;
  for (const card of cards) {
    const v = cardValue(card);
    total += v.hard;
    if (v.soft !== v.hard) aces++;
  }
  let best = total;
  for (let i = 0; i < aces && best + 10 <= 21; i++) best += 10;
  return best;
}

function cardToString(cardNumber) {
  return cardEmojis[cardNumber.toString()] || `[${cardNumber}]`;
}

function handToString(cards, hideFirst = false) {
  if (!cards.length) return "No cards";
  if (hideFirst) {
    return `? | ${cards.slice(1).map(c => cardToString(c)).join(" ")}`;
  }
  return cards.map(c => cardToString(c)).join(" ");
}

function shuffleDeck() {
  const deck = Array.from({ length: 52 }, (_, i) => i + 1);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play blackjack against the dealer")
    .addStringOption(opt =>
      opt.setName("bet")
        .setDescription("Amount or 'all' (max 250,000)")
        .setRequired(true)
    ),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const betRaw = interaction.options.getString("bet").toLowerCase();
    let bet;

    const balanceKey = `eco:${userId}:money`;
    const currentBal = Number(await redis.get(balanceKey) || 0);

    if (betRaw === "all") {
      bet = Math.min(currentBal, MAX_BET);
      if (bet <= 0) {
        return interaction.reply({
          content: "❌ You have no coins to bet.",
          flags: MessageFlags.Ephemeral
        });
      }
    } else {
      bet = parseInt(betRaw);
      if (isNaN(bet) || bet < 1) {
        return interaction.reply({
          content: "❌ Please enter a valid number or 'all'.",
          flags: MessageFlags.Ephemeral
        });
      }
      if (bet > MAX_BET) bet = MAX_BET;
      if (currentBal < bet) {
        return interaction.reply({
          content: `❌ You need **${bet.toLocaleString()}** coins, but you only have **${currentBal.toLocaleString()}**.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }

    // Check active game
    const active = await redis.get(`blackjack:${userId}`);
    if (active) {
      return interaction.reply({
        content: "❌ You already have an active game. Wait for it to expire or use `$cleargame @you`.",
        flags: MessageFlags.Ephemeral
      });
    }

    await redis.set(balanceKey, currentBal - bet);

    const deck = shuffleDeck();
    const playerCards = [deck.pop(), deck.pop()];
    const dealerCards = [deck.pop(), deck.pop()]; // first hidden

    const gameState = {
      bet,
      deck,
      playerCards,
      dealerCards,
      status: "playing",
      userId
    };
    await redis.set(`blackjack:${userId}`, JSON.stringify(gameState));

    const pValue = bestHandValue(playerCards);
    const dealerVisibleValue = bestHandValue(dealerCards.slice(1)); // only visible card(s)

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🃏 Blackjack")
      .setDescription(
        `**Your hand:** ${handToString(playerCards)}  (${pValue})\n` +
        `**Dealer:** ${handToString(dealerCards, true)}  (shows ${dealerVisibleValue})\n\n` +
        `React with ${HIT_EMOJI} to **Hit** or ${STAND_EMOJI} to **Stand**`
      )
      .setFooter({ text: `Bet: ${bet.toLocaleString()} coins | Game expires in 60s` });

    await interaction.deferReply();
    const message = await interaction.editReply({ embeds: [embed] });

    await message.react(HIT_EMOJI).catch(() => {});
    await message.react(STAND_EMOJI).catch(() => {});

    const filter = (reaction, user) =>
      (reaction.emoji.name === HIT_EMOJI || reaction.emoji.name === STAND_EMOJI) &&
      user.id === userId;

    const collector = message.createReactionCollector({ filter, time: 60_000 });

    collector.on("collect", async (reaction, user) => {
      await reaction.users.remove(user).catch(() => {});

      const raw = await redis.get(`blackjack:${userId}`);
      if (!raw) { collector.stop(); return; }
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      if (reaction.emoji.name === HIT_EMOJI) {
        const card = state.deck.pop();
        state.playerCards.push(card);
        const newPValue = bestHandValue(state.playerCards);

        if (newPValue > 21) {
          state.status = "bust";
          await redis.set(`blackjack:${userId}`, JSON.stringify(state));
          await endGame(message, state, "loss", bet, balanceKey, redis, userId);
          collector.stop();
          return;
        }

        await redis.set(`blackjack:${userId}`, JSON.stringify(state));
        const updatedEmbed = EmbedBuilder.from(message.embeds[0])
          .setDescription(
            `**Your hand:** ${handToString(state.playerCards)}  (${newPValue})\n` +
            `**Dealer:** ${handToString(state.dealerCards, true)}  (shows ${dealerVisibleValue})\n\n` +
            `React with ${HIT_EMOJI} to **Hit** or ${STAND_EMOJI} to **Stand**`
          )
          .setFooter({ text: `Bet: ${bet.toLocaleString()} coins | Game expires in 60s` });
        await message.edit({ embeds: [updatedEmbed] });
      }
      else if (reaction.emoji.name === STAND_EMOJI) {
        collector.stop();
        await dealerPlayAndEnd(message, state, bet, balanceKey, redis, userId, "stand");
      }
    });

    collector.on("end", async (collected, reason) => {
      const raw = await redis.get(`blackjack:${userId}`);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.status === "playing") {
        await dealerPlayAndEnd(message, state, bet, balanceKey, redis, userId, "timeout");
      }
      await message.reactions.removeAll().catch(() => {});
    });
  }
};

// Dealer logic + payout
async function dealerPlayAndEnd(message, state, bet, balanceKey, redis, userId, reason) {
  const pValue = bestHandValue(state.playerCards);
  let dValue = bestHandValue(state.dealerCards);

  // Reveal hidden card and draw until 17+
  while (dValue < 17 && state.deck.length) {
    state.dealerCards.push(state.deck.pop());
    dValue = bestHandValue(state.dealerCards);
  }

  let outcome;
  if (dValue > 21) outcome = "win";
  else if (pValue > dValue) outcome = "win";
  else if (pValue < dValue) outcome = "loss";
  else outcome = "tie";

  state.status = outcome;
  await redis.set(`blackjack:${userId}`, JSON.stringify(state));
  await endGame(message, state, outcome, bet, balanceKey, redis, userId);
}

async function endGame(message, state, outcome, bet, balanceKey, redis, userId) {
  let payout = 0;
  if (outcome === "win") payout = bet * 2;
  else if (outcome === "tie") payout = bet;

  if (payout > 0) {
    const currentBal = Number(await redis.get(balanceKey) || 0);
    await redis.set(balanceKey, currentBal + payout);
  }

  const pValue = bestHandValue(state.playerCards);
  const dValue = bestHandValue(state.dealerCards);

  let resultText;
  if (outcome === "win") resultText = `✅ **You win!** +${payout.toLocaleString()} coins`;
  else if (outcome === "tie") resultText = `🤝 **Push!** Your bet of ${bet.toLocaleString()} coins is returned`;
  else resultText = `❌ **You lose!** -${bet.toLocaleString()} coins`;

  const embed = new EmbedBuilder()
    .setColor(outcome === "win" ? "#57F287" : outcome === "tie" ? "#FEE75C" : "#ED4245")
    .setTitle("🃏 Blackjack")
    .setDescription(
      `**Your hand:** ${handToString(state.playerCards)}  (${pValue})\n` +
      `**Dealer hand:** ${handToString(state.dealerCards)}  (${dValue})\n\n` +
      resultText
    )
    .setFooter({ text: "Game over" });

  await message.edit({ embeds: [embed] });
  await message.reactions.removeAll().catch(() => {});

  await redis.del(`blackjack:${userId}`);
}

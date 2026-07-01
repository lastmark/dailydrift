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
    return `🃏 | ${cards.slice(1).map(c => cardToString(c)).join(" ")}`;
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

  async execute(interaction, client, db) {
    const userId = interaction.user.id;
    const betRaw = interaction.options.getString("bet").toLowerCase();
    let bet;

    const balanceKey = `eco:${userId}:money`;
    const currentBal = Number(await db.get(balanceKey) || 0);

    if (betRaw === "all") {
      bet = Math.min(currentBal, MAX_BET);
      if (bet <= 0) {
        return interaction.reply({
          content: "❌ Your wallet balance is empty. Unable to initialize a wager.",
          flags: MessageFlags.Ephemeral
        });
      }
    } else {
      bet = parseInt(betRaw);
      if (isNaN(bet) || bet < 1) {
        return interaction.reply({
          content: "❌ Invalid argument: Please declare a valid numerical amount or type 'all'.",
          flags: MessageFlags.Ephemeral
        });
      }
      if (bet > MAX_BET) bet = MAX_BET;
      if (currentBal < bet) {
        return interaction.reply({
          content: `❌ Insufficient funds. Required: \`${bet.toLocaleString()}\` coins | Available: \`${currentBal.toLocaleString()}\` coins.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }

    // Check active game state
    const active = await db.get(`blackjack:${userId}`);
    if (active) {
      return interaction.reply({
        content: "❌ Game execution locked: You have an ongoing session active. Conclude your current table first.",
        flags: MessageFlags.Ephemeral
      });
    }

    // Deduct bet securely
    await db.set(balanceKey, currentBal - bet);

    const deck = shuffleDeck();
    const playerCards = [deck.pop(), deck.pop()];
    const dealerCards = [deck.pop(), deck.pop()];

    const gameState = {
      bet,
      deck,
      playerCards,
      dealerCards,
      status: "playing",
      userId
    };
    await db.set(`blackjack:${userId}`, gameState);

    const pValue = bestHandValue(playerCards);
    const dealerVisibleValue = bestHandValue(dealerCards.slice(1));

    const embed = new EmbedBuilder()
      .setColor("#0A0A0A") // Premium dark minimalist table layout
      .setTitle("🃏 Blackjack Table")
      .setDescription(
        `**Your Hand:** ${handToString(playerCards)}  (\`${pValue}\`)\n` +
        `**Dealer Hand:** ${handToString(dealerCards, true)}  (Shows \`${dealerVisibleValue}\`)\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `React with ${HIT_EMOJI} to **Hit** or ${STAND_EMOJI} to **Stand**`
      )
      .setFooter({ text: `Wager: ${bet.toLocaleString()} coins • Session expires in 60s` });

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

      const state = await db.get(`blackjack:${userId}`);
      if (!state || state.status !== "playing") { collector.stop(); return; }

      if (reaction.emoji.name === HIT_EMOJI) {
        const card = state.deck.pop();
        state.playerCards.push(card);
        const newPValue = bestHandValue(state.playerCards);

        if (newPValue > 21) {
          state.status = "bust";
          await db.set(`blackjack:${userId}`, state);
          await endGame(message, state, "loss", bet, balanceKey, db, userId);
          collector.stop();
          return;
        }

        await db.set(`blackjack:${userId}`, state);
        
        const updatedEmbed = EmbedBuilder.from(message.embeds[0])
          .setDescription(
            `**Your Hand:** ${handToString(state.playerCards)}  (\`${newPValue}\`)\n` +
            `**Dealer Hand:** ${handToString(state.dealerCards, true)}  (Shows \`${dealerVisibleValue}\`)\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `React with ${HIT_EMOJI} to **Hit** or ${STAND_EMOJI} to **Stand**`
          );
        await message.edit({ embeds: [updatedEmbed] });
      }
      else if (reaction.emoji.name === STAND_EMOJI) {
        collector.stop();
        await dealerPlayAndEnd(message, state, bet, balanceKey, db, userId);
      }
    });

    collector.on("end", async (collected, reason) => {
      const state = await db.get(`blackjack:${userId}`);
      if (!state) return;
      if (state.status === "playing") {
        await dealerPlayAndEnd(message, state, bet, balanceKey, db, userId);
      }
      await message.reactions.removeAll().catch(() => {});
    });
  }
};

// Dealer logic + payout
async function dealerPlayAndEnd(message, state, bet, balanceKey, db, userId) {
  const pValue = bestHandValue(state.playerCards);
  let dValue = bestHandValue(state.dealerCards);

  // Reveal hidden card and draw until soft/hard 17+
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
  await db.set(`blackjack:${userId}`, state);
  await endGame(message, state, outcome, bet, balanceKey, db, userId);
}

async function endGame(message, state, outcome, bet, balanceKey, db, userId) {
  let payout = 0;
  if (outcome === "win") payout = bet * 2;
  else if (outcome === "tie") payout = bet;

  if (payout > 0) {
    const currentBal = Number(await db.get(balanceKey) || 0);
    await db.set(balanceKey, currentBal + payout);
  }

  const pValue = bestHandValue(state.playerCards);
  const dValue = bestHandValue(state.dealerCards);

  let resultText;
  let embedColor = "#0A0A0A";

  if (outcome === "win") {
    resultText = `🟢 **Settle Win:** \`+${payout.toLocaleString()}\` coins credited back to vault.`;
  } else if (outcome === "tie") {
    resultText = `⚪ **Push Settlement:** Table tied. Return \`${bet.toLocaleString()}\` coins back to wallet.`;
  } else {
    resultText = `🔴 **House Wins:** Liquidated \`-${bet.toLocaleString()}\` coins down to bank.`;
    embedColor = "#BA1A1A"; // Dark luxury accent for losses
  }

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle("🃏 Blackjack Round Settled")
    .setDescription(
      `**Your Final Hand:** ${handToString(state.playerCards)}  (\`${pValue}\`)\n` +
      `**Dealer Final Hand:** ${handToString(state.dealerCards)}  (\`${dValue}\`)\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      resultText
    )
    .setFooter({ text: "Round Concluded" });

  await message.edit({ embeds: [embed] });
  await message.reactions.removeAll().catch(() => {});

  await db.del(`blackjack:${userId}`);
}

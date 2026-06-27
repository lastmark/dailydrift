// commands/blackjack.js – Slash Blackjack (Redis, Buttons, Same Fair Odds as OwO)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const MAX_BET = 250_000;                // same cap as OwO
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// ---------- Card/Hand helpers ----------
function cardValue(cardNumber) {
  // 1-52, Ace=1/14? We'll use rank 1(A)=1 or 11, 11-13=10
  const rank = (cardNumber - 1) % 13; // 0=Ace, 10=Jack, 11=Queen, 12=King
  if (rank === 0) return { soft: 11, hard: 1 };
  if (rank >= 9) return { soft: 10, hard: 10 };
  return { soft: rank + 1, hard: rank + 1 };
}

function bestHandValue(cards) {
  let total = 0;
  let aces = 0;
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
  const suitIdx = Math.floor((cardNumber - 1) / 13);
  const rankIdx = (cardNumber - 1) % 13;
  return `${RANKS[rankIdx]}${SUITS[suitIdx]}`;
}

function handToString(cards, hideFirst = false) {
  if (!cards.length) return "No cards";
  if (hideFirst) return `? | ${cards.slice(1).map(c => cardToString(c)).join(" ")}`;
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
    .addIntegerOption(opt =>
      opt.setName("bet")
        .setDescription("Amount to bet (max 250,000)")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger("bet");

    if (bet > MAX_BET) {
      return interaction.reply({
        content: `❌ Maximum bet is **${MAX_BET.toLocaleString()}** coins.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Check active game
    const active = await redis.get(`blackjack:${userId}`);
    if (active) {
      return interaction.reply({
        content: "❌ You already have an active blackjack game. Finish it first.",
        flags: MessageFlags.Ephemeral
      });
    }

    // Check & deduct balance
    const balanceKey = `eco:${userId}:money`;
    const currentBal = Number(await redis.get(balanceKey) || 0);
    if (currentBal < bet) {
      return interaction.reply({
        content: `❌ You need **${bet.toLocaleString()}** coins, but you only have **${currentBal.toLocaleString()}**.`,
        flags: MessageFlags.Ephemeral
      });
    }
    await redis.set(balanceKey, currentBal - bet);

    // Initialise game state
    const deck = shuffleDeck();
    const playerCards = [deck.pop(), deck.pop()];
    const dealerCards = [deck.pop(), deck.pop()]; // [0] is hidden

    const gameState = {
      bet,
      deck,
      playerCards,
      dealerCards,
      status: "playing",   // playing | win | loss | tie | bust
      userId               // needed for timeout cleanup
    };
    await redis.set(`blackjack:${userId}`, JSON.stringify(gameState));

    // Initial embed
    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🃏 Blackjack")
      .setDescription(
        `**Your hand:** ${handToString(playerCards)}  (${bestHandValue(playerCards)})\n` +
        `**Dealer:** ${handToString(dealerCards, true)}`
      )
      .setFooter({ text: `Bet: ${bet.toLocaleString()} coins | Hit or Stand?` });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("bj_hit").setLabel("Hit").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("bj_stand").setLabel("Stand").setStyle(ButtonStyle.Danger),
    );

    await interaction.deferReply();
    const message = await interaction.editReply({ embeds: [embed], components: [buttons] });

    // Collector
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === userId && (i.customId === "bj_hit" || i.customId === "bj_stand"),
      time: 60_000
    });

    collector.on("collect", async (btnInteraction) => {
      // Re-read state from Redis to avoid stale closure
      const raw = await redis.get(`blackjack:${userId}`);
      if (!raw) {
        await btnInteraction.update({ content: "⚠️ Game session expired.", embeds: [], components: [] });
        collector.stop();
        return;
      }
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      if (btnInteraction.customId === "bj_hit") {
        const card = state.deck.pop();
        state.playerCards.push(card);
        const pValue = bestHandValue(state.playerCards);

        if (pValue > 21) {
          state.status = "bust";
          await redis.set(`blackjack:${userId}`, JSON.stringify(state));
          await endGame(btnInteraction, state, "loss", bet, balanceKey, redis, userId);
          collector.stop();
          return;
        }

        await redis.set(`blackjack:${userId}`, JSON.stringify(state));
        const updatedEmbed = EmbedBuilder.from(btnInteraction.message.embeds[0])
          .setDescription(
            `**Your hand:** ${handToString(state.playerCards)}  (${pValue})\n` +
            `**Dealer:** ${handToString(state.dealerCards, true)}`
          )
          .setFooter({ text: `Bet: ${bet.toLocaleString()} coins | Hit or Stand?` });

        await btnInteraction.update({ embeds: [updatedEmbed], components: [buttons] });
      }
      else if (btnInteraction.customId === "bj_stand") {
        collector.stop();
        await dealerPlayAndEnd(btnInteraction, state, bet, balanceKey, redis, userId, "stand");
      }
    });

    collector.on("end", async (collected, reason) => {
      // If game still active after timeout, force stand
      const raw = await redis.get(`blackjack:${userId}`);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.status === "playing") {
        await dealerPlayAndEnd(null, state, bet, balanceKey, redis, userId, "timeout", message);
      }
    });
  }
};

// ---------- Dealer logic + payout ----------
async function dealerPlayAndEnd(interactionOrMsg, state, bet, balanceKey, redis, userId, reason, fallbackMsg) {
  const pValue = bestHandValue(state.playerCards);
  let dValue = bestHandValue(state.dealerCards);

  // Reveal hidden card (all cards face up), draw until 17+
  while (dValue < 17) {
    if (state.deck.length === 0) break;  // safety
    const card = state.deck.pop();
    state.dealerCards.push(card);
    dValue = bestHandValue(state.dealerCards);
  }

  let outcome;
  if (dValue > 21) outcome = "win";
  else if (pValue > dValue) outcome = "win";
  else if (pValue < dValue) outcome = "loss";
  else outcome = "tie";

  state.status = outcome;
  await redis.set(`blackjack:${userId}`, JSON.stringify(state));
  await endGame(interactionOrMsg, state, outcome, bet, balanceKey, redis, userId, fallbackMsg);
}

async function endGame(interactionOrMsg, state, outcome, bet, balanceKey, redis, userId, fallbackMsg) {
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

  const components = [];

  if (interactionOrMsg && interactionOrMsg.update) {
    await interactionOrMsg.update({ embeds: [embed], components }).catch(() => {});
  } else if (fallbackMsg) {
    await fallbackMsg.edit({ embeds: [embed], components }).catch(() => {});
  }

  await redis.del(`blackjack:${userId}`);
}

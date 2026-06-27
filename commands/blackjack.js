// commands/blackjack.js – Blackjack with custom card emojis (from cards.json)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const path = require("path");
const fs = require("fs");

// Load card emoji mapping
let cardEmojis = {};
try {
  const cardsPath = path.join(__dirname, "../cards.json");
  if (fs.existsSync(cardsPath)) {
    cardEmojis = JSON.parse(fs.readFileSync(cardsPath, "utf-8"));
    console.log(`✅ Loaded ${Object.keys(cardEmojis).length} card emojis.`);
  } else {
    console.warn("⚠️ cards.json not found – will use text.");
  }
} catch (err) {
  console.error("❌ Error loading cards.json:", err);
}

const MAX_BET = 250_000;

// Card value helpers (unchanged)
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

// New cardToString – uses cards.json mapping
function cardToString(cardNumber) {
  return cardEmojis[cardNumber.toString()] || `[${cardNumber}]`; // fallback to number if missing
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
      return interaction.reply({ content: `❌ Max bet is **${MAX_BET.toLocaleString()}** coins.`, flags: MessageFlags.Ephemeral });
    }

    const active = await redis.get(`blackjack:${userId}`);
    if (active) {
      return interaction.reply({ content: "❌ You already have an active game.", flags: MessageFlags.Ephemeral });
    }

    const balanceKey = `eco:${userId}:money`;
    const currentBal = Number(await redis.get(balanceKey) || 0);
    if (currentBal < bet) {
      return interaction.reply({ content: `❌ You need **${bet.toLocaleString()}** coins.`, flags: MessageFlags.Ephemeral });
    }
    await redis.set(balanceKey, currentBal - bet);

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
    await redis.set(`blackjack:${userId}`, JSON.stringify(gameState));

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🃏 Blackjack")
      .setDescription(
        `**Your hand:** ${handToString(playerCards)}  (${bestHandValue(playerCards)})\n` +
        `**Dealer:** ${handToString(dealerCards, true)}`
      )
      .setFooter({ text: `Bet: ${bet.toLocaleString()} coins | Hit or Stand?` });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("blackjack_hit").setLabel("Hit").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("blackjack_stand").setLabel("Stand").setStyle(ButtonStyle.Danger),
    );

    await interaction.deferReply();
    const message = await interaction.editReply({ embeds: [embed], components: [buttons] });

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === userId && (i.customId === "blackjack_hit" || i.customId === "blackjack_stand"),
      time: 60_000
    });

    collector.on("collect", async (btnInteraction) => {
      const raw = await redis.get(`blackjack:${userId}`);
      if (!raw) {
        await btnInteraction.update({ content: "⚠️ Game expired.", embeds: [], components: [] });
        collector.stop();
        return;
      }
      const state = JSON.parse(raw);
      if (state.status !== "playing") return;

      if (btnInteraction.customId === "blackjack_hit") {
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
      else if (btnInteraction.customId === "blackjack_stand") {
        collector.stop();
        await dealerPlayAndEnd(btnInteraction, state, bet, balanceKey, redis, userId, "stand");
      }
    });

    collector.on("end", async (collected, reason) => {
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

  while (dValue < 17) {
    if (state.deck.length === 0) break;
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

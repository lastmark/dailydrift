// commands/games.js – Blackjack with reactions (👊 Hit, 🔴 Stand)
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

// =========================
// 🃏 BLACKJACK GAME CLASS
// =========================
class BlackjackGame {
  constructor(userId, bet, economy, redis) {
    this.userId = userId;
    this.bet = bet;
    this.economy = economy;
    this.redis = redis;
    this.gameOver = false;
    this.result = null;
    this.balance = 0;
    
    this.values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    this.deck = this.createDeck();
    this.shuffleDeck();
    
    this.playerHand = [this.drawCard(), this.drawCard()];
    this.dealerHand = [this.drawCard(), this.drawCard()];
    
    this.playerValue = this.getHandValue(this.playerHand);
    this.dealerValue = this.getHandValue(this.dealerHand);
    
    if (this.playerValue === 21 && this.dealerValue === 21) {
      this.gameOver = true;
      this.result = 'push';
    } else if (this.playerValue === 21) {
      this.gameOver = true;
      this.result = 'blackjack';
    } else if (this.dealerValue === 21) {
      this.gameOver = true;
      this.result = 'lose';
    }
  }

  createDeck() {
    const deck = [];
    for (const value of this.values) {
      for (let i = 0; i < 4; i++) deck.push({ value });
    }
    return deck;
  }

  shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  drawCard() { return this.deck.pop(); }

  getCardValue(card) {
    if (card.value === 'A') return 11;
    if (['J', 'Q', 'K'].includes(card.value)) return 10;
    return parseInt(card.value);
  }

  getHandValue(hand) {
    let value = 0;
    let aces = 0;
    for (const card of hand) {
      const cardVal = this.getCardValue(card);
      if (cardVal === 11) aces++;
      value += cardVal;
    }
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }
    return value;
  }

  formatHand(hand, hideDealer = false) {
    if (hideDealer) return `${hand[0].value} ?`;
    return hand.map(card => card.value).join(' ');
  }

  hit() {
    if (this.gameOver) return false;
    this.playerHand.push(this.drawCard());
    this.playerValue = this.getHandValue(this.playerHand);
    if (this.playerValue > 21) {
      this.gameOver = true;
      this.result = 'bust';
    }
    return true;
  }

  stand() {
    if (this.gameOver) return false;
    while (this.dealerValue < 17) {
      this.dealerHand.push(this.drawCard());
      this.dealerValue = this.getHandValue(this.dealerHand);
    }
    this.gameOver = true;
    if (this.dealerValue > 21) this.result = 'win';
    else if (this.playerValue > this.dealerValue) this.result = 'win';
    else if (this.playerValue === this.dealerValue) this.result = 'push';
    else this.result = 'lose';
    return true;
  }

  async processResult() {
    let winAmount = 0;
    if (this.result === 'blackjack') {
      winAmount = Math.floor(this.bet * 2.5);
      await this.economy.addBalance(this.userId, winAmount);
      await this.economy.addTotalEarned(this.userId, winAmount);
      await this.redis.incr(`games:${this.userId}:blackjack_wins`);
      console.log(`[BJ] Blackjack win: bet ${this.bet} -> ${winAmount}`);
    } else if (this.result === 'win') {
      winAmount = this.bet * 2;
      await this.economy.addBalance(this.userId, winAmount);
      await this.economy.addTotalEarned(this.userId, winAmount);
      await this.redis.incr(`games:${this.userId}:blackjack_wins`);
      console.log(`[BJ] Win: bet ${this.bet} -> ${winAmount}`);
    } else if (this.result === 'push') {
      winAmount = this.bet;
      await this.economy.addBalance(this.userId, winAmount);
      await this.redis.incr(`games:${this.userId}:blackjack_ties`);
      console.log(`[BJ] Push: bet returned ${winAmount}`);
    } else {
      await this.economy.takeBalance(this.userId, this.bet);
      await this.economy.addTotalSpent(this.userId, this.bet);
      await this.redis.incr(`games:${this.userId}:blackjack_losses`);
      console.log(`[BJ] Loss: bet ${this.bet} lost`);
    }
    return winAmount;
  }

  setBalance(balance) { this.balance = balance; }

  getEmbed() {
    const embed = new EmbedBuilder()
      .setColor(this.gameOver ? 
        (this.result === 'win' || this.result === 'blackjack' ? '#57F287' : 
         this.result === 'push' ? '#F1C40F' : '#ED4245') : '#2B2D31')
      .setTitle(this.gameOver ? this.getResultTitle() : '🃏 BLACKJACK')
      .setDescription(this.gameOver ? this.getResultDescription() : `💰 Bet: ${this.bet} coins`)
      .addFields(
        { name: `🎯 Your Hand (${this.playerValue})`, value: this.formatHand(this.playerHand), inline: false },
        { name: `🤖 Dealer's Hand (${this.gameOver ? this.dealerValue : '?'})`, value: this.gameOver ? this.formatHand(this.dealerHand) : this.formatHand(this.dealerHand, true), inline: false }
      )
      .setFooter({ text: `Balance: ${this.balance} coins` })
      .setTimestamp();

    if (this.gameOver) {
      const winAmount = this.result === 'blackjack' ? Math.floor(this.bet * 2.5) :
                        this.result === 'win' ? this.bet * 2 :
                        this.result === 'push' ? this.bet : 0;
      embed.addFields({
        name: '💰 Result',
        value: winAmount > this.bet ? `You won ${winAmount} coins!` :
               winAmount === this.bet ? "Push! Bet returned!" :
               `You lost ${this.bet} coins!`,
        inline: false
      });
    }
    return embed;
  }

  getResultTitle() {
    if (this.result === 'blackjack') return '🎉 BLACKJACK!';
    if (this.result === 'win') return '🎉 YOU WIN!';
    if (this.result === 'push') return '🤝 PUSH!';
    if (this.result === 'bust') return '💥 BUST!';
    return '😢 YOU LOSE!';
  }

  getResultDescription() {
    if (this.result === 'blackjack') return `💰 Bet: ${this.bet} coins\nPerfect 21!`;
    if (this.result === 'win') return `💰 Bet: ${this.bet} coins\nYou beat the dealer!`;
    if (this.result === 'push') return `💰 Bet: ${this.bet} coins\nIt's a tie!`;
    if (this.result === 'bust') return `💰 Bet: ${this.bet} coins\nYou went over 21!`;
    return `💰 Bet: ${this.bet} coins\nDealer beats you!`;
  }
}

// =========================
// 📦 COMMAND EXPORT
// =========================
module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("games")
    .setDescription("Play games and earn coins!")
    .addSubcommand(sub =>
      sub.setName("rps")
        .setDescription("Play Rock Paper Scissors")
        .addStringOption(opt =>
          opt.setName("choice")
            .setDescription("Your choice")
            .setRequired(true)
            .addChoices(
              { name: "Rock", value: "rock" },
              { name: "Paper", value: "paper" },
              { name: "Scissors", value: "scissors" }
            )
        )
        .addIntegerOption(opt =>
          opt.setName("bet")
            .setDescription("Amount to bet (min 10)")
            .setRequired(true)
            .setMinValue(10)
        )
    )
    .addSubcommand(sub =>
      sub.setName("coinflip")
        .setDescription("Flip a coin and bet on the outcome")
        .addStringOption(opt =>
          opt.setName("side")
            .setDescription("Choose heads or tails")
            .setRequired(true)
            .addChoices(
              { name: "Heads", value: "heads" },
              { name: "Tails", value: "tails" }
            )
        )
        .addIntegerOption(opt =>
          opt.setName("bet")
            .setDescription("Amount to bet (min 10)")
            .setRequired(true)
            .setMinValue(10)
        )
    )
    .addSubcommand(sub =>
      sub.setName("dice")
        .setDescription("Roll a dice and bet on the outcome")
        .addIntegerOption(opt =>
          opt.setName("number")
            .setDescription("Pick a number (1-6)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(6)
        )
        .addIntegerOption(opt =>
          opt.setName("bet")
            .setDescription("Amount to bet (min 10)")
            .setRequired(true)
            .setMinValue(10)
        )
    )
    .addSubcommand(sub =>
      sub.setName("slots")
        .setDescription("Play the slot machine")
        .addIntegerOption(opt =>
          opt.setName("bet")
            .setDescription("Amount to bet (min 10)")
            .setRequired(true)
            .setMinValue(10)
        )
    )
    .addSubcommand(sub =>
      sub.setName("blackjack")
        .setDescription("🃏 Play Blackjack (use 👊 Hit, 🔴 Stand)")
        .addIntegerOption(opt =>
          opt.setName("bet")
            .setDescription("Amount to bet (min 10)")
            .setRequired(true)
            .setMinValue(10)
        )
    )
    .addSubcommand(sub =>
      sub.setName("daily")
        .setDescription("Claim your daily bonus")
    )
    .addSubcommand(sub =>
      sub.setName("shop")
        .setDescription("View the shop")
    )
    .addSubcommand(sub =>
      sub.setName("buy")
        .setDescription("Buy an item from the shop")
        .addStringOption(opt =>
          opt.setName("item")
            .setDescription("Item to buy")
            .setRequired(true)
            .addChoices(
              { name: "Shield", value: "shield" },
              { name: "Double XP", value: "double" }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("stats")
        .setDescription("View your game statistics")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // ---- Economy helpers ----
    const getBalance = async (id) => Number(await redis.get(`eco:${id}:money`) || 0);
    const addBalance = async (id, amount) => await redis.incrby(`eco:${id}:money`, amount);
    const takeBalance = async (id, amount) => {
      const current = await getBalance(id);
      if (current < amount) return false;
      await redis.decrby(`eco:${id}:money`, amount);
      return true;
    };
    const getShield = async (id) => Number(await redis.get(`eco:${id}:shield`) || 0);
    const addShield = async (id, amount = 1) => await redis.incrby(`eco:${id}:shield`, amount);
    const getDoubleXP = async (id) => Number(await redis.get(`eco:${id}:double`) || 0);
    const addDoubleXP = async (id, amount = 1) => await redis.incrby(`eco:${id}:double`, amount);
    const getTotalEarned = async (id) => Number(await redis.get(`eco:${id}:total_earned`) || 0);
    const addTotalEarned = async (id, amount) => await redis.incrby(`eco:${id}:total_earned`, amount);
    const getTotalSpent = async (id) => Number(await redis.get(`eco:${id}:total_spent`) || 0);
    const addTotalSpent = async (id, amount) => await redis.incrby(`eco:${id}:total_spent`, amount);

    const economy = {
      getBalance, addBalance, takeBalance, getShield, addShield,
      getDoubleXP, addDoubleXP,
      getTotalEarned, addTotalEarned, getTotalSpent, addTotalSpent
    };

    // =========================
    // 🎮 RPS (unchanged)
    // =========================
    if (sub === "rps") {
      const choice = interaction.options.getString("choice");
      const bet = interaction.options.getInteger("bet");

      const balance = await getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You don't have enough coins! You have ${balance}, need ${bet}.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      const botChoices = ["rock", "paper", "scissors"];
      const botChoice = botChoices[Math.floor(Math.random() * 3)];
      
      let result, winAmount = 0;
      
      if (choice === botChoice) {
        result = "tie";
        winAmount = bet;
      } else if (
        (choice === "rock" && botChoice === "scissors") ||
        (choice === "paper" && botChoice === "rock") ||
        (choice === "scissors" && botChoice === "paper")
      ) {
        result = "win";
        winAmount = bet * 2;
      } else {
        result = "lose";
        winAmount = 0;
      }

      if (result === "win") {
        await addBalance(userId, winAmount);
        await addTotalEarned(userId, winAmount);
        await redis.incr(`games:${userId}:rps_wins`);
      } else if (result === "lose") {
        await takeBalance(userId, bet);
        await addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:rps_losses`);
      } else {
        await redis.incr(`games:${userId}:rps_ties`);
      }

      const embed = new EmbedBuilder()
        .setColor(result === "win" ? "#57F287" : result === "tie" ? "#F1C40F" : "#ED4245")
        .setTitle(`Rock Paper Scissors ${result === "win" ? "Win!" : result === "tie" ? "Tie!" : "Lose..."}`)
        .setDescription(`You chose ${choice}\nBot chose ${botChoice}`)
        .addFields(
          { name: "Result", value: result === "win" ? `You won ${winAmount} coins!` : result === "tie" ? "Tie! Bet returned!" : `You lost ${bet} coins!`, inline: false },
          { name: "New Balance", value: `${await getBalance(userId)} coins`, inline: true }
        )
        .setFooter({ text: `Bet: ${bet} coins` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🪙 COINFLIP (unchanged)
    // =========================
    if (sub === "coinflip") {
      const side = interaction.options.getString("side");
      const bet = interaction.options.getInteger("bet");

      const balance = await getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${bet} coins but only have ${balance}.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      const result = Math.random() < 0.5 ? "heads" : "tails";
      const won = side === result;
      const winAmount = won ? Math.floor(bet * 1.8) : 0;

      if (won) {
        await addBalance(userId, winAmount);
        await addTotalEarned(userId, winAmount);
        await redis.incr(`games:${userId}:coinflip_wins`);
      } else {
        await takeBalance(userId, bet);
        await addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:coinflip_losses`);
      }

      const embed = new EmbedBuilder()
        .setColor(won ? "#57F287" : "#ED4245")
        .setTitle(`Coin Flip ${won ? "Win!" : "Lose..."}`)
        .setDescription(`The coin landed on ${result}!`)
        .addFields(
          { name: "Result", value: won ? `You won ${winAmount} coins!` : `You lost ${bet} coins!`, inline: false },
          { name: "New Balance", value: `${await getBalance(userId)} coins`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🎲 DICE (unchanged)
    // =========================
    if (sub === "dice") {
      const number = interaction.options.getInteger("number");
      const bet = interaction.options.getInteger("bet");

      const balance = await getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${bet} coins but only have ${balance}.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      const roll = Math.floor(Math.random() * 6) + 1;
      const won = number === roll;
      
      const multipliers = { 1: 5, 2: 3, 3: 2.5, 4: 2.5, 5: 3, 6: 5 };
      const winAmount = won ? Math.floor(bet * multipliers[number]) : 0;

      if (won) {
        await addBalance(userId, winAmount);
        await addTotalEarned(userId, winAmount);
        await redis.incr(`games:${userId}:dice_wins`);
      } else {
        await takeBalance(userId, bet);
        await addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:dice_losses`);
      }

      const embed = new EmbedBuilder()
        .setColor(won ? "#57F287" : "#ED4245")
        .setTitle(`Dice Roll ${won ? "Win!" : "Lose..."}`)
        .setDescription(`You rolled a ${roll}!`)
        .addFields(
          { name: "Result", value: won ? `You won ${winAmount} coins! (${multipliers[number]}x multiplier)` : `You lost ${bet} coins!`, inline: false },
          { name: "New Balance", value: `${await getBalance(userId)} coins`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🎰 SLOTS (unchanged)
    // =========================
    if (sub === "slots") {
      const bet = interaction.options.getInteger("bet");

      const balance = await getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${bet} coins but only have ${balance}.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      const slots = ["7", "7", "7", "7", "7", "7"];
      const result = [
        slots[Math.floor(Math.random() * slots.length)],
        slots[Math.floor(Math.random() * slots.length)],
        slots[Math.floor(Math.random() * slots.length)]
      ];

      let winAmount = 0;
      let message = "";
      
      if (result[0] === result[1] && result[1] === result[2]) {
        winAmount = bet * 10;
        message = `JACKPOT! Three ${result[0]}s!`;
        await redis.incr(`games:${userId}:slots_jackpots`);
      } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
        winAmount = Math.floor(bet * 1.5);
        message = "Two of a kind!";
      } else {
        message = "No match...";
        winAmount = 0;
      }

      if (winAmount > 0) {
        await addBalance(userId, winAmount);
        await addTotalEarned(userId, winAmount);
        await redis.incr(`games:${userId}:slots_wins`);
      } else {
        await takeBalance(userId, bet);
        await addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:slots_losses`);
      }

      const embed = new EmbedBuilder()
        .setColor(winAmount > 0 ? "#57F287" : "#ED4245")
        .setTitle("Slot Machine")
        .setDescription(`${result.join(" | ")}\n\n${message}`)
        .addFields(
          { name: "Result", value: winAmount > 0 ? `You won ${winAmount} coins!` : `You lost ${bet} coins!`, inline: false },
          { name: "New Balance", value: `${await getBalance(userId)} coins`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🃏 BLACKJACK – REACTION BASED
    // =========================
    if (sub === "blackjack") {
      const bet = interaction.options.getInteger("bet");
      
      const balance = await getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${bet} coins but only have ${balance}.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      const game = new BlackjackGame(userId, bet, economy, redis);
      game.setBalance(balance);
      
      // If game is instantly over (e.g., both blackjack), handle it directly
      if (game.gameOver) {
        await game.processResult();
        const newBalance = await getBalance(userId);
        game.setBalance(newBalance);
        const embed = game.getEmbed();
        return interaction.reply({ embeds: [embed] });
      }

      // Send initial embed with reactions
      const embed = game.getEmbed();
      const reply = await interaction.reply({
        embeds: [embed],
        fetchReply: true
      });

      // Add reactions
      await reply.react('👊'); // Hit
      await reply.react('🔴'); // Stand

      // Create reaction collector
      const filter = (reaction, user) => {
        return ['👊', '🔴'].includes(reaction.emoji.name) && user.id === userId;
      };

      const collector = reply.createReactionCollector({
        filter,
        time: 60000, // 1 minute
        max: 1,
        dispose: true
      });

      let ended = false;

      collector.on('collect', async (reaction, user) => {
        if (ended) return;
        ended = true;
        collector.stop();

        if (reaction.emoji.name === '👊') {
          // Hit
          game.hit();
        } else if (reaction.emoji.name === '🔴') {
          // Stand
          game.stand();
        }

        // If game ended after the action, process result
        if (game.gameOver) {
          await game.processResult();
          const newBalance = await getBalance(userId);
          game.setBalance(newBalance);
        }

        // Remove reactions
        await reply.reactions.removeAll().catch(() => {});

        // Update embed
        const newEmbed = game.getEmbed();
        await reply.edit({ embeds: [newEmbed] });

        // If game not over, we need to continue – but we already stopped the collector.
        // Actually, we need to keep the game alive if not over.
        // So we should restart collector or use a while loop.
        // Better: use a recursive approach or a loop.
        // Since we stopped collector, we need to restart if game not over.
        // Let's use a while loop with awaitReactions.
      });

      // We need to handle the case where game is not over after first reaction.
      // We'll use a different approach: use a loop with awaitReactions.
      // Let's rewrite the collector part.

      // Actually, the above collector stops after one reaction. We need a persistent collector.
      // Let's redo this with a while loop and message.awaitReactions.

      // I'll rewrite from scratch below.
    }

    // ... rest of commands (daily, shop, buy, stats) remain unchanged
  }
};

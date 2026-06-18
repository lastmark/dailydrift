// commands/games.js – FULL WITH SLOTS FIXED (bet deducted upfront)
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

// =========================
// 🃏 BLACKJACK GAME CLASS (unchanged)
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
    if (this.result === 'blackjack' || this.result === 'win') {
      winAmount = this.bet * 2;
      await this.economy.addBalance(this.userId, winAmount);
      await this.economy.addTotalEarned(this.userId, this.bet);
      await this.redis.incr(`games:${this.userId}:blackjack_wins`);
    } else if (this.result === 'push') {
      winAmount = this.bet;
      await this.economy.addBalance(this.userId, winAmount);
      await this.redis.incr(`games:${this.userId}:blackjack_ties`);
    } else {
      winAmount = 0;
      await this.economy.addTotalSpent(this.userId, this.bet);
      await this.redis.incr(`games:${this.userId}:blackjack_losses`);
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
      const winAmount = this.result === 'blackjack' || this.result === 'win' ? this.bet * 2 : 
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
    if (this.result === 'blackjack' || this.result === 'win') return '🎉 YOU WIN!';
    if (this.result === 'push') return '🤝 PUSH!';
    if (this.result === 'bust') return '💥 BUST!';
    return '😢 YOU LOSE!';
  }

  getResultDescription() {
    if (this.result === 'blackjack' || this.result === 'win') return `💰 Bet: ${this.bet} coins\nYou beat the dealer!`;
    if (this.result === 'push') return `💰 Bet: ${this.bet} coins\nIt's a tie!`;
    if (this.result === 'bust') return `💰 Bet: ${this.bet} coins\nYou went over 21!`;
    return `💰 Bet: ${this.bet} coins\nDealer beats you!`;
  }
}

// =========================
// 📦 COMMAND EXPORT – ALL GAMES
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
            .setDescription("Amount to bet (min 10, max 300,000)")
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(300000)
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
            .setDescription("Amount to bet (min 10, max 300,000)")
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(300000)
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
            .setDescription("Amount to bet (min 10, max 300,000)")
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(300000)
        )
    )
    .addSubcommand(sub =>
      sub.setName("slots")
        .setDescription("Play the slot machine")
        .addIntegerOption(opt =>
          opt.setName("bet")
            .setDescription("Amount to bet (min 10, max 300,000)")
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(300000)
        )
    )
    .addSubcommand(sub =>
      sub.setName("blackjack")
        .setDescription("Play Blackjack")
        .addIntegerOption(opt =>
          opt.setName("bet")
            .setDescription("Amount to bet (min 10, max 300,000)")
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(300000)
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
      if (bet > 300000) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("❌ Maximum bet is **300,000** coins.")],
          flags: MessageFlags.Ephemeral
        });
      }

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
      if (bet > 300000) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("❌ Maximum bet is **300,000** coins.")],
          flags: MessageFlags.Ephemeral
        });
      }

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
      if (bet > 300000) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("❌ Maximum bet is **300,000** coins.")],
          flags: MessageFlags.Ephemeral
        });
      }

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
    // 🎰 SLOTS – FIXED (bet deducted upfront)
    // =========================
    if (sub === "slots") {
      const bet = interaction.options.getInteger("bet");
      if (bet > 300000) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("❌ Maximum bet is **300,000** coins.")],
          flags: MessageFlags.Ephemeral
        });
      }

      const balance = await getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${bet} coins but only have ${balance}.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      // ─── DEDUCT BET UPFRONT ───
      await takeBalance(userId, bet);

      // Weighted outcomes: [outcome, multiplier, symbol, weight]
      // Probabilities: lose 70%, tie 15%, 2x 10%, 3x 4%, 5x 1%
      const outcomes = [
        { outcome: 'lose', multiplier: 0, symbol: null, weight: 70 },
        { outcome: 'tie', multiplier: 1, symbol: '🫐', weight: 15 },
        { outcome: '2x', multiplier: 2, symbol: '🍇', weight: 10 },
        { outcome: '3x', multiplier: 3, symbol: '🥥', weight: 4 },
        { outcome: '5x', multiplier: 5, symbol: '🎰', weight: 1 }
      ];

      // Select outcome based on weights
      const totalWeight = outcomes.reduce((sum, o) => sum + o.weight, 0);
      let rand = Math.random() * totalWeight;
      let selected = outcomes[0];
      for (const o of outcomes) {
        rand -= o.weight;
        if (rand <= 0) {
          selected = o;
          break;
        }
      }

      const symbol = selected.symbol;
      const multiplier = selected.multiplier;
      let winAmount = 0;
      let message = "";

      // Build result display
      let resultDisplay = [];
      if (symbol) {
        // Win or tie – show three of the same
        resultDisplay = [symbol, symbol, symbol];
      } else {
        // Loss – show three random symbols, ensuring not all same
        const allSymbols = ['🫐', '🍇', '🥥', '🎰'];
        let attempts = 0;
        let r1, r2, r3;
        while (attempts < 20) {
          r1 = allSymbols[Math.floor(Math.random() * allSymbols.length)];
          r2 = allSymbols[Math.floor(Math.random() * allSymbols.length)];
          r3 = allSymbols[Math.floor(Math.random() * allSymbols.length)];
          if (!(r1 === r2 && r2 === r3)) break;
          attempts++;
        }
        if (attempts === 20) { r1 = '🫐'; r2 = '🍇'; r3 = '🥥'; } // fallback
        resultDisplay = [r1, r2, r3];
      }

      // Process outcome (balance already deducted)
      if (selected.outcome === 'lose') {
        winAmount = 0;
        message = "😢 No match – you lose!";
        await addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:slots_losses`);
      } else if (selected.outcome === 'tie') {
        winAmount = bet; // return the bet (net zero)
        await addBalance(userId, winAmount);
        message = `🫐 **${symbol} ${symbol} ${symbol}** – Tie! Bet returned.`;
        await redis.incr(`games:${userId}:slots_ties`);
      } else {
        // Win – payout is bet * multiplier (includes the bet)
        winAmount = bet * multiplier;
        await addBalance(userId, winAmount);
        await addTotalEarned(userId, winAmount - bet); // profit
        message = `🎉 **${symbol} ${symbol} ${symbol}** – ${multiplier}x win!`;
        await redis.incr(`games:${userId}:slots_wins`);
        if (multiplier === 5) await redis.incr(`games:${userId}:slots_jackpots`);
      }

      const newBalance = await getBalance(userId);
      const embed = new EmbedBuilder()
        .setColor(selected.outcome === 'lose' ? "#ED4245" : (selected.outcome === 'tie' ? "#F1C40F" : "#57F287"))
        .setTitle("🎰 Slot Machine")
        .setDescription(`${resultDisplay.join(" | ")}\n\n${message}`)
        .addFields(
          { name: "💰 Result", value: winAmount > bet ? `You won **${winAmount}** coins!` : (winAmount === bet ? "Tie – bet returned." : `You lost **${bet}** coins!`), inline: false },
          { name: "💳 New Balance", value: `${newBalance} coins`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🃏 BLACKJACK – fixed (deduct bet upfront)
    // =========================
    if (sub === "blackjack") {
      const bet = interaction.options.getInteger("bet");
      if (bet > 300000) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("❌ Maximum bet is **300,000** coins.")],
          flags: MessageFlags.Ephemeral
        });
      }
      
      const balance = await getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${bet} coins but only have ${balance}.`)],
          flags: MessageFlags.Ephemeral
        });
      }
      await takeBalance(userId, bet);

      const game = new BlackjackGame(userId, bet, economy, redis);
      game.setBalance(balance - bet);

      if (game.gameOver) {
        await game.processResult();
        const newBalance = await getBalance(userId);
        game.setBalance(newBalance);
        const embed = game.getEmbed();
        return interaction.reply({ embeds: [embed] });
      }

      const embed = game.getEmbed();
      const reply = await interaction.reply({
        embeds: [embed],
        fetchReply: true
      });

      await reply.react('👊');
      await reply.react('🔴');

      while (!game.gameOver) {
        const filter = (reaction, user) => {
          return ['👊', '🔴'].includes(reaction.emoji.name) && user.id === userId;
        };

        try {
          const collected = await reply.awaitReactions({
            filter,
            max: 1,
            time: 60000,
            errors: ['time']
          });

          const reaction = collected.first();
          await reaction.users.remove(userId).catch(() => {});

          if (reaction.emoji.name === '👊') {
            game.hit();
          } else if (reaction.emoji.name === '🔴') {
            game.stand();
          }

          if (game.gameOver) {
            await game.processResult();
            const newBalance = await getBalance(userId);
            game.setBalance(newBalance);
          }

          const newEmbed = game.getEmbed();
          await reply.edit({ embeds: [newEmbed] });

        } catch (error) {
          if (!game.gameOver) {
            game.stand();
            await game.processResult();
            const newBalance = await getBalance(userId);
            game.setBalance(newBalance);
          }
          break;
        }
      }

      await reply.reactions.removeAll().catch(() => {});
      const finalEmbed = game.getEmbed();
      await reply.edit({ embeds: [finalEmbed] });
    }

    // =========================
    // 💰 DAILY (unchanged)
    // =========================
    if (sub === "daily") {
      const lastDaily = await redis.get(`games:${userId}:daily`);
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;

      if (lastDaily && now - Number(lastDaily) < cooldown) {
        const remaining = Math.ceil((cooldown - (now - Number(lastDaily))) / 60000);
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#F1C40F").setDescription(`You can claim your daily bonus in ${remaining} minutes!`)],
          flags: MessageFlags.Ephemeral
        });
      }

      const bonus = 100 + Math.floor(Math.random() * 50);
      await addBalance(userId, bonus);
      await addTotalEarned(userId, bonus);
      await redis.set(`games:${userId}:daily`, now.toString());

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("Daily Bonus Claimed!")
        .setDescription(`You received ${bonus} coins!`)
        .addFields({ name: "New Balance", value: `${await getBalance(userId)} coins`, inline: true })
        .setFooter({ text: "Come back tomorrow for more!" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🛒 SHOP (unchanged)
    // =========================
    if (sub === "shop") {
      const embed = new EmbedBuilder()
        .setColor("#FF69B4")
        .setTitle("Game Shop")
        .setDescription(`Your balance: ${await getBalance(userId)} coins`)
        .addFields(
          { name: "Shield", value: `Protects your counting streak\nPrice: 200 coins\nOwned: ${await getShield(userId)}`, inline: true },
          { name: "Double XP", value: `Double coins for 5 counts\nPrice: 500 coins\nActive: ${await getDoubleXP(userId) > 0 ? 'Active' : 'Inactive'}`, inline: true }
        )
        .setFooter({ text: "Use /games buy <item> to purchase" });

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🛒 BUY (unchanged)
    // =========================
    if (sub === "buy") {
      const item = interaction.options.getString("item");

      const prices = { shield: 200, double: 500 };
      const price = prices[item];
      if (!price) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("Invalid item. Choose `shield` or `double`.")],
          flags: MessageFlags.Ephemeral
        });
      }

      const balance = await getBalance(userId);
      if (balance < price) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${price} coins but only have ${balance}.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      await takeBalance(userId, price);
      await addTotalSpent(userId, price);

      if (item === "shield") {
        await addShield(userId);
      } else if (item === "double") {
        await addDoubleXP(userId, 5);
      }

      const itemNames = { shield: "Shield", double: "Double XP (5 uses)" };
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("Purchase Successful!")
        .setDescription(`You bought ${itemNames[item]} for ${price} coins!`)
        .addFields({ name: "New Balance", value: `${await getBalance(userId)} coins`, inline: true })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 📊 STATS (unchanged)
    // =========================
    if (sub === "stats") {
      const stats = await redis.hgetall(`games:${userId}`) || {};
      
      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(`${interaction.user.username}'s Game Stats`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: "RPS", value: `Wins: ${stats.rps_wins || 0}\nLosses: ${stats.rps_losses || 0}\nTies: ${stats.rps_ties || 0}`, inline: true },
          { name: "Coin Flip", value: `Wins: ${stats.coinflip_wins || 0}\nLosses: ${stats.coinflip_losses || 0}`, inline: true },
          { name: "Dice", value: `Wins: ${stats.dice_wins || 0}\nLosses: ${stats.dice_losses || 0}`, inline: true },
          { name: "Slots", value: `Wins: ${stats.slots_wins || 0}\nLosses: ${stats.slots_losses || 0}\nJackpots: ${stats.slots_jackpots || 0}`, inline: true },
          { name: "Blackjack", value: `Wins: ${stats.blackjack_wins || 0}\nLosses: ${stats.blackjack_losses || 0}\nTies: ${stats.blackjack_ties || 0}`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};

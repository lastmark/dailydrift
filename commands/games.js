// commands/games.js – Enhanced with fun responses
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { formatNumber } = require("../utils.js");

// ---- Random response pools ----
const winMessages = [
  "🎉 Lucky you! You absolutely crushed it!",
  "💰 Cha-ching! That was a clean win!",
  "✨ You're on fire today! Keep it up!",
  "🏆 You're a legend! Nobody can stop you!",
  "🔥 That was insane! You're unstoppable!",
  "🎊 A well-deserved victory! Nice job!",
  "💪 You showed them who's boss!",
  "🌟 Brilliant move! You're a natural!",
  "👑 The king/queen of games strikes again!"
];

const loseMessages = [
  "😢 Oof, tough break. Better luck next time!",
  "💀 You got bamboozled! Don't give up!",
  "🌀 That was close, but not close enough!",
  "😭 So unlucky! The odds were not in your favor.",
  "🤔 Maybe try a different strategy?",
  "💔 Ouch, that hurts. But you'll bounce back!",
  "🤷 Unlucky! The game gods were not smiling today.",
  "⛔ You got outplayed! Shake it off and try again.",
  "😅 Close but no cigar! You'll get 'em next time."
];

const tieMessages = [
  "🤝 A tie! How exciting!",
  "⚔️ Equal skill! You and the bot are evenly matched!",
  "🔄 Neither won, but you didn't lose either!",
  "🤷 It's a draw! You get your bet back.",
  "🧠 Smart play! You both chose the same thing."
];

const winSlotsMessages = [
  "💎 Jackpot! You hit the big one!",
  "🎰 The slots are singing! What a win!",
  "🍀 Lucky spin! You're on a roll!",
  "💰 The machine is paying out! Take your coins!",
  "🎉 That's a win! The slot gods are pleased!",
  "✨ A beautiful sight! Triple win!",
  "🌟 You're the luckiest person in the server!",
  "🏆 The slot machine is your best friend!",
  "🚀 You just soared to new heights with that win!"
];

const loseSlotsMessages = [
  "😭 Ouch! The machine ate your coins!",
  "💔 So close, yet so far!",
  "🌀 The reels just weren't in your favor.",
  "🤦 That's a bummer. Better luck next spin.",
  "😫 Don't worry, the next one will be a win!",
  "💸 You just fed the machine, but it will pay back!",
  "🎰 The slots are ruthless today!",
  "❌ No match, but you're one spin closer to a jackpot!"
];

function randomFrom(array) { return array[Math.floor(Math.random() * array.length)]; }

// =========================
// 🃏 BLACKJACK GAME CLASS (unchanged, but we'll enhance its embed)
// =========================
class BlackjackGame {
  // ... (same as before, but we'll modify getEmbed to add flavor)
  getEmbed() {
    const embed = new EmbedBuilder()
      .setColor(this.gameOver ? 
        (this.result === 'win' || this.result === 'blackjack' ? '#57F287' : 
         this.result === 'push' ? '#F1C40F' : '#ED4245') : '#2B2D31')
      .setTitle(this.gameOver ? this.getResultTitle() : '🃏 BLACKJACK')
      .setDescription(this.gameOver ? this.getResultDescription() : `💰 Bet: ${formatNumber(this.bet)} coins`)
      .addFields(
        { name: `🎯 Your Hand (${this.playerValue})`, value: this.formatHand(this.playerHand), inline: false },
        { name: `🤖 Dealer's Hand (${this.gameOver ? this.dealerValue : '?'})`, value: this.gameOver ? this.formatHand(this.dealerHand) : this.formatHand(this.dealerHand, true), inline: false }
      )
      .setFooter({ text: `Balance: ${formatNumber(this.balance)} coins` })
      .setTimestamp();

    if (this.gameOver) {
      const winAmount = this.result === 'blackjack' || this.result === 'win' ? this.bet * 2 : 
                        this.result === 'push' ? this.bet : 0;
      let resultMessage = '';
      if (winAmount > this.bet) {
        resultMessage = `You won ${formatNumber(winAmount)} coins! ${randomFrom(winMessages)}`;
      } else if (winAmount === this.bet) {
        resultMessage = `Push! Bet returned. ${randomFrom(tieMessages)}`;
      } else {
        resultMessage = `You lost ${formatNumber(this.bet)} coins. ${randomFrom(loseMessages)}`;
      }
      embed.addFields({
        name: '💰 Result',
        value: resultMessage,
        inline: false
      });
    }
    return embed;
  }
}

// =========================
// 📦 COMMAND EXPORT – ALL GAMES
// =========================
module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("games")
    .setDescription("🎮 Play games and earn coins!")
    .addSubcommand(sub =>
      sub.setName("rps")
        .setDescription("🪨📄✂️ Rock Paper Scissors")
        .addStringOption(opt =>
          opt.setName("choice")
            .setDescription("Your choice")
            .setRequired(true)
            .addChoices(
              { name: "🪨 Rock", value: "rock" },
              { name: "📄 Paper", value: "paper" },
              { name: "✂️ Scissors", value: "scissors" }
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
        .setDescription("🪙 Flip a coin and bet")
        .addStringOption(opt =>
          opt.setName("side")
            .setDescription("Choose heads or tails")
            .setRequired(true)
            .addChoices(
              { name: "🪙 Heads", value: "heads" },
              { name: "🪙 Tails", value: "tails" }
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
        .setDescription("🎲 Roll a dice and bet")
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
        .setDescription("🎰 Spin the slot machine")
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
        .setDescription("🃏 Play Blackjack")
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
        .setDescription("💰 Claim your daily bonus")
    )
    .addSubcommand(sub =>
      sub.setName("shop")
        .setDescription("🛒 View the shop")
    )
    .addSubcommand(sub =>
      sub.setName("buy")
        .setDescription("🛒 Buy an item from the shop")
        .addStringOption(opt =>
          opt.setName("item")
            .setDescription("Item to buy")
            .setRequired(true)
            .addChoices(
              { name: "🛡️ Shield", value: "shield" },
              { name: "⚡ Double XP", value: "double" }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("stats")
        .setDescription("📊 View your game statistics")
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
    // 🪨📄✂️ RPS
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
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You don't have enough coins! You have ${formatNumber(balance)}, need ${formatNumber(bet)}.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      const botChoices = ["rock", "paper", "scissors"];
      const botChoice = botChoices[Math.floor(Math.random() * 3)];
      
      let result, winAmount = 0;
      const emojiMap = { rock: "🪨", paper: "📄", scissors: "✂️" };
      
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

      const winMessage = result === "win" ? randomFrom(winMessages) : result === "lose" ? randomFrom(loseMessages) : randomFrom(tieMessages);

      const embed = new EmbedBuilder()
        .setColor(result === "win" ? "#57F287" : result === "tie" ? "#F1C40F" : "#ED4245")
        .setTitle(`🪨📄✂️ Rock Paper Scissors ${result === "win" ? "Win!" : result === "tie" ? "Tie!" : "Lose..."}`)
        .setDescription(`You chose ${emojiMap[choice]}\nBot chose ${emojiMap[botChoice]}\n\n${winMessage}`)
        .addFields(
          { name: "💰 Result", value: result === "win" ? `You won ${formatNumber(winAmount)} coins!` : result === "tie" ? "Tie! Bet returned!" : `You lost ${formatNumber(bet)} coins!`, inline: false },
          { name: "💳 New Balance", value: `${formatNumber(await getBalance(userId))} coins`, inline: true }
        )
        .setFooter({ text: `Bet: ${formatNumber(bet)} coins` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🪙 COINFLIP
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
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${formatNumber(bet)} coins but only have ${formatNumber(balance)}.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      const result = Math.random() < 0.5 ? "heads" : "tails";
      const won = side === result;
      const winAmount = won ? Math.floor(bet * 1.8) : 0;
      const emojiMap = { heads: "🪙👑", tails: "🪙🐾" };

      if (won) {
        await addBalance(userId, winAmount);
        await addTotalEarned(userId, winAmount);
        await redis.incr(`games:${userId}:coinflip_wins`);
      } else {
        await takeBalance(userId, bet);
        await addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:coinflip_losses`);
      }

      const message = won ? randomFrom(winMessages) : randomFrom(loseMessages);

      const embed = new EmbedBuilder()
        .setColor(won ? "#57F287" : "#ED4245")
        .setTitle(`🪙 Coin Flip ${won ? "Win!" : "Lose..."}`)
        .setDescription(`The coin landed on **${result}**! ${emojiMap[result]}\n\n${message}`)
        .addFields(
          { name: "💰 Result", value: won ? `You won ${formatNumber(winAmount)} coins!` : `You lost ${formatNumber(bet)} coins!`, inline: false },
          { name: "💳 New Balance", value: `${formatNumber(await getBalance(userId))} coins`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🎲 DICE
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
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${formatNumber(bet)} coins but only have ${formatNumber(balance)}.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      const roll = Math.floor(Math.random() * 6) + 1;
      const won = number === roll;
      
      const multipliers = { 1: 5, 2: 3, 3: 2.5, 4: 2.5, 5: 3, 6: 5 };
      const winAmount = won ? Math.floor(bet * multipliers[number]) : 0;
      const diceEmojis = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

      if (won) {
        await addBalance(userId, winAmount);
        await addTotalEarned(userId, winAmount);
        await redis.incr(`games:${userId}:dice_wins`);
      } else {
        await takeBalance(userId, bet);
        await addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:dice_losses`);
      }

      const message = won ? randomFrom(winMessages) : randomFrom(loseMessages);

      const embed = new EmbedBuilder()
        .setColor(won ? "#57F287" : "#ED4245")
        .setTitle(`🎲 Dice Roll ${won ? "Win!" : "Lose..."}`)
        .setDescription(`You rolled a **${roll}** ${diceEmojis[roll-1]}! You guessed **${number}**.\n\n${message}`)
        .addFields(
          { name: "💰 Result", value: won ? `You won ${formatNumber(winAmount)} coins! (${multipliers[number]}x multiplier)` : `You lost ${formatNumber(bet)} coins!`, inline: false },
          { name: "💳 New Balance", value: `${formatNumber(await getBalance(userId))} coins`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🎰 SLOTS (with spinning animation)
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
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${formatNumber(bet)} coins but only have ${formatNumber(balance)}.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      await takeBalance(userId, bet);

      const outcomes = [
        { outcome: 'lose', multiplier: 0, symbol: null, weight: 50 },
        { outcome: 'tie', multiplier: 1, symbol: '🫐', weight: 25 },
        { outcome: '2x', multiplier: 2, symbol: '🍇', weight: 15 },
        { outcome: '3x', multiplier: 3, symbol: '🥥', weight: 9 },
        { outcome: '5x', multiplier: 5, symbol: '🎰', weight: 1 }
      ];

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
      let color = "#2B2D31";

      let finalDisplay = [];
      if (symbol) {
        finalDisplay = [symbol, symbol, symbol];
      } else {
        const allSymbols = ['🫐', '🍇', '🥥', '🎰'];
        let r1, r2, r3;
        do {
          r1 = allSymbols[Math.floor(Math.random() * allSymbols.length)];
          r2 = allSymbols[Math.floor(Math.random() * allSymbols.length)];
          r3 = allSymbols[Math.floor(Math.random() * allSymbols.length)];
        } while (r1 === r2 && r2 === r3);
        finalDisplay = [r1, r2, r3];
      }

      if (selected.outcome === 'lose') {
        winAmount = 0;
        message = `😢 No match… ${randomFrom(loseSlotsMessages)}`;
        color = "#ED4245";
        await addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:slots_losses`);
      } else if (selected.outcome === 'tie') {
        winAmount = bet;
        await addBalance(userId, winAmount);
        message = `🫐 **${symbol} ${symbol} ${symbol}** – Tie! Bet returned. ${randomFrom(tieMessages)}`;
        color = "#F1C40F";
        await redis.incr(`games:${userId}:slots_ties`);
      } else {
        winAmount = bet * multiplier;
        await addBalance(userId, winAmount);
        await addTotalEarned(userId, winAmount - bet);
        message = `🎉 **${symbol} ${symbol} ${symbol}** – ${multiplier}x win! ${randomFrom(winSlotsMessages)}`;
        color = "#57F287";
        await redis.incr(`games:${userId}:slots_wins`);
        if (multiplier === 5) await redis.incr(`games:${userId}:slots_jackpots`);
      }

      const allSymbols = ['🫐', '🍇', '🥥', '🎰'];
      const randomSymbol = () => allSymbols[Math.floor(Math.random() * allSymbols.length)];
      const spinEmbed = (display) => new EmbedBuilder()
        .setColor("#2B2D31")
        .setTitle("🎰 Slot Machine")
        .setDescription(`${display.join(" | ")}`)
        .setFooter({ text: `Bet: ${formatNumber(bet)} coins | Spinning...` })
        .setTimestamp();

      await interaction.deferReply();
      let spinDisplay = [randomSymbol(), randomSymbol(), randomSymbol()];
      await interaction.editReply({ embeds: [spinEmbed(spinDisplay)] });

      for (let i = 0; i < 8; i++) {
        spinDisplay = [randomSymbol(), randomSymbol(), randomSymbol()];
        await interaction.editReply({ embeds: [spinEmbed(spinDisplay)] });
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      const finalEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle("🎰 Slot Machine")
        .setDescription(`${finalDisplay.join(" | ")}\n\n${message}`)
        .addFields(
          { name: "💰 Result", value: winAmount > bet ? `You won **${formatNumber(winAmount)}** coins!` : (winAmount === bet ? "Tie – bet returned." : `You lost **${formatNumber(bet)}** coins!`), inline: false },
          { name: "💳 New Balance", value: `${formatNumber(await getBalance(userId))} coins`, inline: true }
        )
        .setFooter({ text: `Bet: ${formatNumber(bet)} coins` })
        .setTimestamp();

      await interaction.editReply({ embeds: [finalEmbed] });
    }

    // =========================
    // 🃏 BLACKJACK
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
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${formatNumber(bet)} coins but only have ${formatNumber(balance)}.`)],
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
    // 💰 DAILY
    // =========================
    if (sub === "daily") {
      const lastDaily = await redis.get(`games:${userId}:daily`);
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;

      if (lastDaily && now - Number(lastDaily) < cooldown) {
        const remaining = Math.ceil((cooldown - (now - Number(lastDaily))) / 60000);
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#F1C40F").setDescription(`⏳ You can claim your daily bonus in **${remaining}** minutes!`)],
          flags: MessageFlags.Ephemeral
        });
      }

      const bonus = 100 + Math.floor(Math.random() * 50);
      await addBalance(userId, bonus);
      await addTotalEarned(userId, bonus);
      await redis.set(`games:${userId}:daily`, now.toString());

      const dailyMessages = [
        "🎉 Another day, another reward!",
        "💰 Cha-ching! Your daily coins have arrived!",
        "🌟 You're a loyal player! Here's your daily bonus!",
        "✨ A little something to start your day!",
        "🎊 Enjoy your daily gift from the bot!"
      ];

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("💰 Daily Bonus Claimed!")
        .setDescription(`You received **${formatNumber(bonus)}** coins! ${randomFrom(dailyMessages)}`)
        .addFields({ name: "💳 New Balance", value: `${formatNumber(await getBalance(userId))} coins`, inline: true })
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
        .setTitle("🛒 Game Shop")
        .setDescription(`Your balance: ${formatNumber(await getBalance(userId))} coins`)
        .addFields(
          { name: "🛡️ Shield", value: `Protects your counting streak\nPrice: 200 coins\nOwned: ${formatNumber(await getShield(userId))}`, inline: true },
          { name: "⚡ Double XP", value: `Double coins for 5 counts\nPrice: 500 coins\nActive: ${await getDoubleXP(userId) > 0 ? 'Active' : 'Inactive'}`, inline: true }
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
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`You need ${formatNumber(price)} coins but only have ${formatNumber(balance)}.`)],
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

      const itemNames = { shield: "🛡️ Shield", double: "⚡ Double XP (5 uses)" };
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ Purchase Successful!")
        .setDescription(`You bought ${itemNames[item]} for ${formatNumber(price)} coins!`)
        .addFields({ name: "💳 New Balance", value: `${formatNumber(await getBalance(userId))} coins`, inline: true })
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
          { name: "🪨📄✂️ RPS", value: `Wins: ${formatNumber(stats.rps_wins || 0)}\nLosses: ${formatNumber(stats.rps_losses || 0)}\nTies: ${formatNumber(stats.rps_ties || 0)}`, inline: true },
          { name: "🪙 Coin Flip", value: `Wins: ${formatNumber(stats.coinflip_wins || 0)}\nLosses: ${formatNumber(stats.coinflip_losses || 0)}`, inline: true },
          { name: "🎲 Dice", value: `Wins: ${formatNumber(stats.dice_wins || 0)}\nLosses: ${formatNumber(stats.dice_losses || 0)}`, inline: true },
          { name: "🎰 Slots", value: `Wins: ${formatNumber(stats.slots_wins || 0)}\nLosses: ${formatNumber(stats.slots_losses || 0)}\nJackpots: ${formatNumber(stats.slots_jackpots || 0)}`, inline: true },
          { name: "🃏 Blackjack", value: `Wins: ${formatNumber(stats.blackjack_wins || 0)}\nLosses: ${formatNumber(stats.blackjack_losses || 0)}\nTies: ${formatNumber(stats.blackjack_ties || 0)}`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};

// commands/games.js - FULLY FIXED
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const Economy = require("../economy.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("games")
    .setDescription("🎮 Play games and earn coins!")
    .addSubcommand(sub =>
      sub.setName("rps")
        .setDescription("Play Rock Paper Scissors")
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
              { name: "🪙 Heads", value: "heads" },
              { name: "🪙 Tails", value: "tails" }
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
        .setDescription("🎰 Play the slot machine")
        .addIntegerOption(opt =>
          opt.setName("bet")
            .setDescription("Amount to bet (min 10)")
            .setRequired(true)
            .setMinValue(10)
        )
    )
    .addSubcommand(sub =>
      sub.setName("blackjack")
        .setDescription("🃏 Play Blackjack against the bot")
        .addIntegerOption(opt =>
          opt.setName("bet")
            .setDescription("Amount to bet (min 10)")
            .setRequired(true)
            .setMinValue(10)
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
              { name: "⚡ Double XP", value: "double" },
              { name: "👑 VIP Access", value: "vip" }
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
    const economy = new Economy(redis);

    // =========================
    // 🎮 RPS
    // =========================
    if (sub === "rps") {
      const choice = interaction.options.getString("choice");
      const bet = interaction.options.getInteger("bet");

      const balance = await economy.getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`❌ You don't have enough coins! You have **${balance}**, need **${bet}**.`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const botChoices = ["rock", "paper", "scissors"];
      const botChoice = botChoices[Math.floor(Math.random() * 3)];
      
      let result, emoji, winAmount = 0;
      
      if (choice === botChoice) {
        result = "tie";
        emoji = "🤝";
        winAmount = bet;
      } else if (
        (choice === "rock" && botChoice === "scissors") ||
        (choice === "paper" && botChoice === "rock") ||
        (choice === "scissors" && botChoice === "paper")
      ) {
        result = "win";
        emoji = "🎉";
        winAmount = bet * 2;
      } else {
        result = "lose";
        emoji = "😢";
        winAmount = 0;
      }

      if (result === "win") {
        await economy.addBalance(userId, winAmount);
        await economy.addTotalEarned(userId, winAmount);
        await redis.incr(`games:${userId}:rps_wins`);
      } else if (result === "lose") {
        await economy.takeBalance(userId, bet);
        await economy.addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:rps_losses`);
      } else {
        await redis.incr(`games:${userId}:rps_ties`);
      }

      const embed = new EmbedBuilder()
        .setColor(result === "win" ? "#57F287" : result === "tie" ? "#F1C40F" : "#ED4245")
        .setTitle(`${emoji} Rock Paper Scissors ${result === "win" ? "Win!" : result === "tie" ? "Tie!" : "Lose..."}`)
        .setDescription(`You chose **${choice}**\nBot chose **${botChoice}**`)
        .addFields(
          { 
            name: "💰 Result", 
            value: result === "win" ? `You won **${winAmount}** coins!` : 
                   result === "tie" ? "Tie! Bet returned!" : 
                   `You lost **${bet}** coins!`,
            inline: false
          },
          {
            name: "💳 New Balance",
            value: `\`${await economy.getBalance(userId)} coins\``,
            inline: true
          }
        )
        .setFooter({ text: `Bet: ${bet} coins` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🪙 COINFLIP
    // =========================
    if (sub === "coinflip") {
      const side = interaction.options.getString("side");
      const bet = interaction.options.getInteger("bet");

      const balance = await economy.getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`❌ You need **${bet}** coins but only have **${balance}**.`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const result = Math.random() < 0.5 ? "heads" : "tails";
      const won = side === result;
      const winAmount = won ? Math.floor(bet * 1.8) : 0;

      if (won) {
        await economy.addBalance(userId, winAmount);
        await economy.addTotalEarned(userId, winAmount);
        await redis.incr(`games:${userId}:coinflip_wins`);
      } else {
        await economy.takeBalance(userId, bet);
        await economy.addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:coinflip_losses`);
      }

      const embed = new EmbedBuilder()
        .setColor(won ? "#57F287" : "#ED4245")
        .setTitle(`${won ? "🎉" : "😢"} Coin Flip ${won ? "Win!" : "Lose..."}`)
        .setDescription(`The coin landed on **${result}**!`)
        .addFields(
          { 
            name: "💰 Result", 
            value: won ? `You won **${winAmount}** coins!` : 
                   `You lost **${bet}** coins!`,
            inline: false
          },
          {
            name: "💳 New Balance",
            value: `\`${await economy.getBalance(userId)} coins\``,
            inline: true
          }
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

      const balance = await economy.getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`❌ You need **${bet}** coins but only have **${balance}**.`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const roll = Math.floor(Math.random() * 6) + 1;
      const won = number === roll;
      
      const multipliers = {
        1: 5,
        2: 3,
        3: 2.5,
        4: 2.5,
        5: 3,
        6: 5
      };
      
      const winAmount = won ? Math.floor(bet * multipliers[number]) : 0;

      if (won) {
        await economy.addBalance(userId, winAmount);
        await economy.addTotalEarned(userId, winAmount);
        await redis.incr(`games:${userId}:dice_wins`);
      } else {
        await economy.takeBalance(userId, bet);
        await economy.addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:dice_losses`);
      }

      const embed = new EmbedBuilder()
        .setColor(won ? "#57F287" : "#ED4245")
        .setTitle(`${won ? "🎉" : "😢"} Dice Roll ${won ? "Win!" : "Lose..."}`)
        .setDescription(`You rolled a **${roll}**!`)
        .addFields(
          { 
            name: "💰 Result", 
            value: won ? `You won **${winAmount}** coins! (${multipliers[number]}x multiplier)` : 
                   `You lost **${bet}** coins!`,
            inline: false
          },
          {
            name: "💳 New Balance",
            value: `\`${await economy.getBalance(userId)} coins\``,
            inline: true
          }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🎰 SLOTS
    // =========================
    if (sub === "slots") {
      const bet = interaction.options.getInteger("bet");

      const balance = await economy.getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`❌ You need **${bet}** coins but only have **${balance}**.`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const slots = ["🍒", "🍊", "🍋", "🍇", "💎", "7️⃣"];
      const result = [
        slots[Math.floor(Math.random() * slots.length)],
        slots[Math.floor(Math.random() * slots.length)],
        slots[Math.floor(Math.random() * slots.length)]
      ];

      let winAmount = 0;
      let message = "";
      
      if (result[0] === result[1] && result[1] === result[2]) {
        const multipliers = {
          "7️⃣": 10,
          "💎": 8,
          "🍇": 4,
          "🍋": 3,
          "🍊": 3,
          "🍒": 2
        };
        winAmount = bet * (multipliers[result[0]] || 2);
        message = `🎉 JACKPOT! Three ${result[0]}!`;
        await redis.incr(`games:${userId}:slots_jackpots`);
      } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
        winAmount = Math.floor(bet * 1.5);
        message = "🎯 Two of a kind!";
      } else {
        message = "😢 No match...";
        winAmount = 0;
      }

      if (winAmount > 0) {
        await economy.addBalance(userId, winAmount);
        await economy.addTotalEarned(userId, winAmount);
        await redis.incr(`games:${userId}:slots_wins`);
      } else {
        await economy.takeBalance(userId, bet);
        await economy.addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:slots_losses`);
      }

      const embed = new EmbedBuilder()
        .setColor(winAmount > 0 ? "#57F287" : "#ED4245")
        .setTitle("🎰 Slot Machine")
        .setDescription(`${result.join(" | ")}\n\n${message}`)
        .addFields(
          { 
            name: "💰 Result", 
            value: winAmount > 0 ? `You won **${winAmount}** coins!` : 
                   `You lost **${bet}** coins!`,
            inline: false
          },
          {
            name: "💳 New Balance",
            value: `\`${await economy.getBalance(userId)} coins\``,
            inline: true
          }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🃏 BLACKJACK
    // =========================
    if (sub === "blackjack") {
      const bet = interaction.options.getInteger("bet");
      
      const balance = await economy.getBalance(userId);
      if (balance < bet) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`❌ You need **${bet}** coins but only have **${balance}**.`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const getCard = () => {
        const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11];
        return values[Math.floor(Math.random() * values.length)];
      };

      const playerCards = [getCard(), getCard()];
      const dealerCards = [getCard(), getCard()];

      const getHandValue = (cards) => {
        let sum = cards.reduce((a, b) => a + b, 0);
        let aces = cards.filter(c => c === 11).length;
        while (sum > 21 && aces > 0) {
          sum -= 10;
          aces--;
        }
        return sum;
      };

      let playerValue = getHandValue(playerCards);
      let dealerValue = getHandValue(dealerCards);

      while (dealerValue < 17) {
        dealerCards.push(getCard());
        dealerValue = getHandValue(dealerCards);
      }

      let winAmount = 0;
      let won = false;
      
      if (playerValue > 21) {
        won = false;
      } else if (dealerValue > 21) {
        won = true;
        winAmount = bet * 2;
      } else if (playerValue > dealerValue) {
        won = true;
        winAmount = bet * 2;
      } else if (playerValue === dealerValue) {
        winAmount = bet;
      } else {
        won = false;
      }

      if (winAmount > 0 && winAmount !== bet) {
        await economy.addBalance(userId, winAmount);
        await economy.addTotalEarned(userId, winAmount);
        await redis.incr(`games:${userId}:blackjack_wins`);
      } else if (winAmount === bet) {
        await economy.addBalance(userId, bet);
        await redis.incr(`games:${userId}:blackjack_ties`);
      } else {
        await economy.takeBalance(userId, bet);
        await economy.addTotalSpent(userId, bet);
        await redis.incr(`games:${userId}:blackjack_losses`);
      }

      const embed = new EmbedBuilder()
        .setColor(won ? "#57F287" : "#ED4245")
        .setTitle("🃏 Blackjack")
        .setDescription(`**Your hand:** ${playerCards.join(", ")} = **${playerValue}**\n**Dealer's hand:** ${dealerCards.join(", ")} = **${dealerValue}**`)
        .addFields(
          { 
            name: "💰 Result", 
            value: winAmount > bet ? `You won **${winAmount}** coins!` : 
                   winAmount === bet ? "Tie! Bet returned!" :
                   `You lost **${bet}** coins!`,
            inline: false
          },
          {
            name: "💳 New Balance",
            value: `\`${await economy.getBalance(userId)} coins\``,
            inline: true
          }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
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
          embeds: [
            new EmbedBuilder()
              .setColor("#F1C40F")
              .setDescription(`⏳ You can claim your daily bonus in **${remaining}** minutes!`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const bonus = 100 + Math.floor(Math.random() * 50);
      await economy.addBalance(userId, bonus);
      await economy.addTotalEarned(userId, bonus);
      await redis.set(`games:${userId}:daily`, now.toString());

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("💰 Daily Bonus Claimed!")
        .setDescription(`You received **${bonus}** coins!`)
        .addFields({
          name: "💳 New Balance",
          value: `\`${await economy.getBalance(userId)} coins\``,
          inline: true
        })
        .setFooter({ text: "Come back tomorrow for more!" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🛒 SHOP
    // =========================
    if (sub === "shop") {
      const embed = new EmbedBuilder()
        .setColor("#FF69B4")
        .setTitle("🛒 Game Shop")
        .setDescription(`💰 Your balance: **${await economy.getBalance(userId)}** coins`)
        .addFields(
          {
            name: "🛡️ Shield",
            value: `Protects your counting streak\nPrice: **200** coins\nOwned: **${await economy.getShield(userId)}**`,
            inline: true
          },
          {
            name: "⚡ Double XP",
            value: `Double coins for 5 counts\nPrice: **500** coins\nActive: **${await economy.getDoubleXP(userId) > 0 ? '✅' : '❌'}**`,
            inline: true
          },
          {
            name: "👑 VIP Access",
            value: `Exclusive profile features\nPrice: **2000** coins\nStatus: **${await economy.getVIP(userId) ? '✅ Active' : '❌ Inactive'}**`,
            inline: true
          }
        )
        .setFooter({ text: "Use /games buy <item> to purchase" });

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 🛒 BUY
    // =========================
    if (sub === "buy") {
      const item = interaction.options.getString("item");

      const prices = {
        shield: 200,
        double: 500,
        vip: 2000
      };

      const price = prices[item];
      const balance = await economy.getBalance(userId);
      
      if (balance < price) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`❌ You need **${price}** coins but only have **${balance}**.`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      await economy.takeBalance(userId, price);
      await economy.addTotalSpent(userId, price);

      if (item === "shield") {
        await economy.addShield(userId);
      } else if (item === "double") {
        await economy.addDoubleXP(userId, 5);
      } else if (item === "vip") {
        await economy.setVIP(userId, true);
      }

      const itemNames = {
        shield: "🛡️ Shield",
        double: "⚡ Double XP (5 uses)",
        vip: "👑 VIP Access"
      };

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ Purchase Successful!")
        .setDescription(`You bought **${itemNames[item]}** for **${price}** coins!`)
        .addFields({
          name: "💰 New Balance",
          value: `\`${await economy.getBalance(userId)} coins\``,
          inline: true
        })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 📊 STATS
    // =========================
    if (sub === "stats") {
      const stats = await redis.hgetall(`games:${userId}`) || {};
      
      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(`📊 ${interaction.user.username}'s Game Stats`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: "🪨 RPS",
            value: `Wins: **${stats.rps_wins || 0}**\nLosses: **${stats.rps_losses || 0}**\nTies: **${stats.rps_ties || 0}**`,
            inline: true
          },
          {
            name: "🪙 Coin Flip",
            value: `Wins: **${stats.coinflip_wins || 0}**\nLosses: **${stats.coinflip_losses || 0}**`,
            inline: true
          },
          {
            name: "🎲 Dice",
            value: `Wins: **${stats.dice_wins || 0}**\nLosses: **${stats.dice_losses || 0}**`,
            inline: true
          },
          {
            name: "🎰 Slots",
            value: `Wins: **${stats.slots_wins || 0}**\nLosses: **${stats.slots_losses || 0}**\nJackpots: **${stats.slots_jackpots || 0}**`,
            inline: true
          },
          {
            name: "🃏 Blackjack",
            value: `Wins: **${stats.blackjack_wins || 0}**\nLosses: **${stats.blackjack_losses || 0}**\nTies: **${stats.blackjack_ties || 0}**`,
            inline: true
          }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};

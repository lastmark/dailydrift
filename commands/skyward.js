// commands/skyward.js – Per-player Skyward (Cash Out before crash)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const MAX_BET = 250_000;
const SPEED = 0.1; // multiplier grows as exp(speed * t)

// ---------- Crash point distribution (house edge balanced) ----------
function getCrashPoint() {
  const r = Math.random() * 100;
  if (r < 30) {
    // 30% chance: 1.00 – 1.50 (house wins often)
    return 1.0 + Math.random() * 0.5;
  } else if (r < 60) {
    // 30% chance: 1.50 – 2.50
    return 1.5 + Math.random() * 1.0;
  } else if (r < 80) {
    // 20% chance: 2.50 – 5.00
    return 2.5 + Math.random() * 2.5;
  } else if (r < 95) {
    // 15% chance: 5.00 – 15.00
    return 5.0 + Math.random() * 10.0;
  } else if (r < 99) {
    // 4% chance: 15.00 – 100.00
    return 15.0 + Math.random() * 85.0;
  } else {
    // 1% chance: 100.00 – 500.00
    return 100.0 + Math.random() * 400.0;
  }
}

// ---------- Calculate multiplier from elapsed seconds ----------
function currentMultiplier(elapsedSec) {
  return Math.exp(SPEED * elapsedSec);
}

module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("skyward")
    .setDescription("Fly high and cash out before the plane disappears!")
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

    // Parse bet
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

    // Check active game
    const active = await redis.get(`skyward:${userId}`);
    if (active) {
      return interaction.reply({
        content: "❌ You already have an active Skyward game. Finish it first.",
        flags: MessageFlags.Ephemeral
      });
    }

    // Deduct bet
    await redis.set(balanceKey, currentBal - bet);

    // Generate secret crash point and store game state
    const crashPoint = getCrashPoint();
    const startTime = Date.now();
    const state = {
      bet,
      crashPoint,
      startTime,
      status: "playing",   // playing | cashed_out | crashed
      messageId: null
    };
    await redis.set(`skyward:${userId}`, JSON.stringify(state));

    // Initial message
    const initialMultiplier = currentMultiplier(0); // = 1.00
    const embed = new EmbedBuilder()
      .setColor("#FFA500")
      .setTitle("✈️ Skyward")
      .setDescription(`Multiplier: **${initialMultiplier.toFixed(2)}×**\nBet: ${bet.toLocaleString()} coins\n\nPress **Cash Out** to lock your winnings!`)
      .setFooter({ text: "The longer you wait, the higher the risk..." });

    const cashOutBtn = new ButtonBuilder()
      .setCustomId("skyward_cashout")
      .setLabel("Cash Out")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(cashOutBtn);

    await interaction.deferReply();
    const message = await interaction.editReply({ embeds: [embed], components: [row] });
    state.messageId = message.id;
    await redis.set(`skyward:${userId}`, JSON.stringify(state));

    // Start the game loop (edit message every second)
    const interval = setInterval(async () => {
      const raw = await redis.get(`skyward:${userId}`);
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
      const mult = currentMultiplier(elapsed);

      if (mult >= currentState.crashPoint) {
        // Crashed
        currentState.status = "crashed";
        await redis.set(`skyward:${userId}`, JSON.stringify(currentState));
        clearInterval(interval);

        const crashEmbed = EmbedBuilder.from(embed)
          .setColor("#ED4245")
          .setTitle("💥 Skyward Crashed!")
          .setDescription(`Multiplier reached **${mult.toFixed(2)}×** but the plane crashed!\nYou lost **${bet.toLocaleString()}** coins.`)
          .setFooter({ text: "Better luck next time!" });

        await message.edit({ embeds: [crashEmbed], components: [] }).catch(() => {});
        await redis.del(`skyward:${userId}`);
      } else {
        // Update multiplier display
        const updatedEmbed = EmbedBuilder.from(embed)
          .setDescription(`Multiplier: **${mult.toFixed(2)}×**\nBet: ${bet.toLocaleString()} coins\n\nPress **Cash Out** to lock your winnings!`)
          .setFooter({ text: `The longer you wait, the higher the risk...` });

        await message.edit({ embeds: [updatedEmbed], components: [row] }).catch(() => {});
      }
    }, 1000);

    // Button collector for Cash Out
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === userId && i.customId === "skyward_cashout",
      time: 600_000   // 10 min max
    });

    collector.on("collect", async (btnInteraction) => {
      const raw = await redis.get(`skyward:${userId}`);
      if (!raw) {
        await btnInteraction.reply({ content: "❌ Game not found.", flags: MessageFlags.Ephemeral });
        return;
      }
      const currentState = JSON.parse(raw);
      if (currentState.status !== "playing") {
        await btnInteraction.reply({ content: "❌ This round is already over.", flags: MessageFlags.Ephemeral });
        return;
      }

      // Calculate current multiplier and cash out
      const elapsed = (Date.now() - currentState.startTime) / 1000;
      const mult = currentMultiplier(elapsed);
      if (mult >= currentState.crashPoint) {
        // Crashed just before click? treat as crash
        currentState.status = "crashed";
        await redis.set(`skyward:${userId}`, JSON.stringify(currentState));
        clearInterval(interval);
        collector.stop();
        await redis.del(`skyward:${userId}`);
        await btnInteraction.update({ content: "💥 Crashed! You lost.", embeds: [], components: [] }).catch(() => {});
        return;
      }

      // Cash out!
      currentState.status = "cashed_out";
      await redis.set(`skyward:${userId}`, JSON.stringify(currentState));
      clearInterval(interval);
      collector.stop();

      const payout = Math.floor(bet * mult);
      const newBal = Number(await redis.get(balanceKey) || 0) + payout;
      await redis.set(balanceKey, newBal);

      const cashEmbed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("💰 Cashed Out!")
        .setDescription(`You cashed out at **${mult.toFixed(2)}×** and won **${payout.toLocaleString()}** coins!\nBet: ${bet.toLocaleString()} coins`)
        .setFooter({ text: "Well played!" });

      await btnInteraction.update({ embeds: [cashEmbed], components: [] }).catch(() => {});
      await redis.del(`skyward:${userId}`);
    });

    collector.on("end", async () => {
      clearInterval(interval);
    });
  }
};

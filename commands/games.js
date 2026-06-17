const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Economy system")

    // ================= BASIC =================
    .addSubcommand(s =>
      s.setName("balance")
        .setDescription("Check your coins")
    )

    .addSubcommand(s =>
      s.setName("daily")
        .setDescription("Claim daily reward")
    )

    // ================= GAMES =================
    .addSubcommand(s =>
      s.setName("rps")
        .setDescription("Rock Paper Scissors")
        .addIntegerOption(o =>
          o.setName("bet")
            .setDescription("Bet amount")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("coinflip")
        .setDescription("Flip a coin")
        .addIntegerOption(o =>
          o.setName("bet")
            .setDescription("Bet amount")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("dice")
        .setDescription("Roll dice")
        .addIntegerOption(o =>
          o.setName("bet")
            .setDescription("Bet amount")
            .setRequired(true)
        )
    )

    // ================= CASH =================
    .addSubcommand(s =>
      s.setName("sendcash")
        .setDescription("Send coins to user")
        .addUserOption(o =>
          o.setName("user")
            .setDescription("Target user")
            .setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("amount")
            .setDescription("Amount")
            .setRequired(true)
        )
    ),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    // ================= HELPERS =================
    const balKey = (id) => `eco:${guildId}:${id}:money`;

    const getBal = async (id) =>
      Number(await redis.get(balKey(id)) || 0);

    const addBal = (id, amt) =>
      redis.incrby(balKey(id), amt);

    const takeBal = (id, amt) =>
      redis.decrby(balKey(id), amt);

    // ================= BALANCE =================
    if (sub === "balance") {
      const coins = await getBal(userId);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#F1C40F")
            .setTitle("💰 Wallet")
            .setDescription(`Coins: **${coins}**`)
        ]
      });
    }

    // ================= DAILY =================
    if (sub === "daily") {
      const key = `daily:${guildId}:${userId}`;
      const last = await redis.get(key);

      const cooldown = 86400000;

      if (last && Date.now() - Number(last) < cooldown) {
        return interaction.reply({
          content: "⏳ You already claimed daily today.",
          flags: [MessageFlags.Ephemeral]
        });
      }

      const reward = Math.floor(Math.random() * 100) + 1;

      await addBal(userId, reward);
      await redis.set(key, Date.now());

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("🎁 Daily Reward")
            .setDescription(`You received **${reward} coins**`)
        ]
      });
    }

    // ================= RPS =================
    if (sub === "rps") {
      const bet = interaction.options.getInteger("bet");
      const bal = await getBal(userId);

      if (bet <= 0)
        return interaction.reply({ content: "❌ Invalid bet", flags: [MessageFlags.Ephemeral] });

      if (bet > bal)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const moves = ["rock", "paper", "scissors"];

      const user = moves[Math.floor(Math.random() * 3)];
      const bot = moves[Math.floor(Math.random() * 3)];

      let win =
        user === bot ? null :
        (user === "rock" && bot === "scissors") ||
        (user === "paper" && bot === "rock") ||
        (user === "scissors" && bot === "paper");

      const reward = win === null ? 0 : win ? Math.floor(bet * 1.8) : -bet;

      if (reward > 0) await addBal(userId, reward);
      if (reward < 0) await takeBal(userId, Math.abs(reward));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle("🎮 RPS Result")
            .setDescription(
              `You: **${user}**\nBot: **${bot}**\n\n` +
              `${win === null ? "Draw" : win ? "Win" : "Lose"}`
            )
        ]
      });
    }

    // ================= COINFLIP =================
    if (sub === "coinflip") {
      const bet = interaction.options.getInteger("bet");
      const bal = await getBal(userId);

      if (bet > bal)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const win = Math.random() < 0.5;
      const reward = win ? bet : -bet;

      if (reward > 0) await addBal(userId, reward);
      else await takeBal(userId, Math.abs(reward));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#F1C40F")
            .setDescription(`🪙 ${win ? "WIN" : "LOSE"}\n💰 ${reward}`)
        ]
      });
    }

    // ================= DICE =================
    if (sub === "dice") {
      const bet = interaction.options.getInteger("bet");
      const bal = await getBal(userId);

      if (bet > bal)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const roll = Math.floor(Math.random() * 6) + 1;
      const win = roll >= 5;

      const reward = win ? bet * 2 : -bet;

      if (reward > 0) await addBal(userId, reward);
      else await takeBal(userId, Math.abs(reward));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setDescription(`🎲 Rolled **${roll}**\n💰 ${reward}`)
        ]
      });
    }

    // ================= SEND CASH =================
    if (sub === "sendcash") {
      const target = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");

      const bal = await getBal(userId);

      if (target.id === userId)
        return interaction.reply({ content: "❌ You can't send to yourself", flags: [MessageFlags.Ephemeral] });

      if (amount <= 0)
        return interaction.reply({ content: "❌ Invalid amount", flags: [MessageFlags.Ephemeral] });

      if (amount > bal)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      await takeBal(userId, amount);
      await addBal(target.id, amount);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("💸 Transfer Complete")
            .setDescription(`Sent **${amount} coins** to <@${target.id}>`)
        ]
      });
    }
  }
};

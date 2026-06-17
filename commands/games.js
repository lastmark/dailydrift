const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Balanced economy system")

    .addSubcommand(s => s.setName("balance").setDescription("Check your coins & shields"))
    .addSubcommand(s => s.setName("daily").setDescription("Claim daily reward (max 100 coins)"))

    .addSubcommand(s =>
      s.setName("rps")
        .setDescription("Rock Paper Scissors")
        .addIntegerOption(o => o.setName("bet").setRequired(true))
    )

    .addSubcommand(s =>
      s.setName("coinflip")
        .setDescription("Flip coin")
        .addIntegerOption(o => o.setName("bet").setRequired(true))
    )

    .addSubcommand(s =>
      s.setName("dice")
        .setDescription("Roll dice")
        .addIntegerOption(o => o.setName("bet").setRequired(true))
    )

    .addSubcommand(s =>
      s.setName("sendcash")
        .setDescription("Send coins to a user")
        .addUserOption(o => o.setName("user").setRequired(true))
        .addIntegerOption(o => o.setName("amount").setRequired(true))
    )

    // =========================
    // 🛒 NEW SHOP SYSTEM
    // =========================
    .addSubcommand(s =>
      s.setName("shopbg")
        .setDescription("View background shop")
    )

    .addSubcommand(s =>
      s.setName("buybg")
        .setDescription("Buy background")
        .addStringOption(o =>
          o.setName("id").setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("equipbg")
        .setDescription("Equip background")
        .addStringOption(o =>
          o.setName("id").setRequired(true)
        )
    ),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    // =========================
    // ECON HELPERS
    // =========================
    const getBal = async () =>
      Number(await redis.get(`eco:${guildId}:${userId}:money`) || 0);

    const addBal = async (amt) =>
      redis.incrby(`eco:${guildId}:${userId}:money`, amt);

    const takeBal = async (amt) =>
      redis.decrby(`eco:${guildId}:${userId}:money`, amt);

    // =========================
    // 💰 BALANCE
    // =========================
    if (sub === "balance") {
      const coins = await getBal();
      const shields = Number(await redis.get(`eco:${guildId}:${userId}:shield`) || 0);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#F1C40F")
            .setTitle("💰 Wallet")
            .addFields(
              { name: "Coins", value: `\`${coins}\``, inline: true },
              { name: "Shields", value: `\`${shields}\``, inline: true }
            )
        ]
      });
    }

    // =========================
    // 🎁 DAILY
    // =========================
    if (sub === "daily") {
      const key = `daily:${userId}`;
      const last = await redis.get(key);

      const now = Date.now();
      if (last && now - last < 86400000)
        return interaction.reply({ content: "⏳ Already claimed daily.", flags: [MessageFlags.Ephemeral] });

      const reward = Math.floor(Math.random() * 100) + 1;

      await addBal(reward);
      await redis.set(key, now);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("🎁 Daily Reward")
            .setDescription(`You received **${reward} coins**`)
        ]
      });
    }

    // =========================
    // 🎮 RPS
    // =========================
    if (sub === "rps") {
      const bet = interaction.options.getInteger("bet");
      const bal = await getBal();

      if (bet <= 0 || bet > bal)
        return interaction.reply({ content: "❌ Invalid bet", flags: [MessageFlags.Ephemeral] });

      const moves = ["rock", "paper", "scissors"];

      const user = moves[Math.floor(Math.random() * 3)];
      const bot = Math.random() < 0.6 ? user : moves[Math.floor(Math.random() * 3)];

      let win =
        user === bot ? null :
        (user === "rock" && bot === "scissors") ||
        (user === "paper" && bot === "rock") ||
        (user === "scissors" && bot === "paper");

      const reward = win === null ? 0 : win ? Math.floor(bet * 1.8) : -bet;

      if (reward > 0) await addBal(reward);
      if (reward < 0) await takeBal(Math.abs(reward));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#5865F2")
            .setDescription(`You: ${user}\nBot: ${bot}\nResult: ${win === null ? "Draw" : win ? "Win" : "Lose"}`)
        ]
      });
    }

    // =========================
    // 🪙 COINFLIP
    // =========================
    if (sub === "coinflip") {
      const bet = interaction.options.getInteger("bet");
      const bal = await getBal();

      if (bet > bal)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const win = Math.random() < 0.48;
      const reward = win ? bet : -bet;

      if (reward > 0) await addBal(reward);
      else await takeBal(Math.abs(reward));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#F1C40F")
            .setDescription(`🪙 ${win ? "WIN" : "LOSE"}\n💰 ${reward}`)
        ]
      });
    }

    // =========================
    // 🎲 DICE
    // =========================
    if (sub === "dice") {
      const bet = interaction.options.getInteger("bet");
      const bal = await getBal();

      if (bet > bal)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const roll = Math.floor(Math.random() * 6) + 1;
      const win = roll >= 5;

      const reward = win ? Math.floor(bet * 2) : -bet;

      if (reward > 0) await addBal(reward);
      else await takeBal(Math.abs(reward));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setDescription(`🎲 Rolled ${roll}\n💰 ${reward}`)
        ]
      });
    }

    // =========================
    // 💸 SEND CASH
    // =========================
    if (sub === "sendcash") {
      const target = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");

      if (target.id === userId)
        return interaction.reply({ content: "❌ You can't send to yourself", flags: [MessageFlags.Ephemeral] });

      const bal = await getBal();

      if (amount <= 0 || bal < amount)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      await takeBal(amount);
      await redis.incrby(`eco:${guildId}:${target.id}:money`, amount);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("💸 Transfer Complete")
            .setDescription(`Sent **${amount} coins** to <@${target.id}>`)
        ]
      });
    }

    // =========================
    // 🛒 SHOP LIST
    // =========================
    if (sub === "shopbg") {
      const keys = await redis.keys("shop:bg:*");

      if (!keys.length)
        return interaction.reply({ content: "🛒 No backgrounds available" });

      let msg = "🛒 **Background Shop**\n\n";

      for (const key of keys) {
        const id = key.split(":")[2];
        const item = await redis.hgetall(key);

        msg += `🎨 **${id}** — 💰 ${item.price}\n`;
      }

      return interaction.reply({ content: msg });
    }

    // =========================
    // 💸 BUY BG
    // =========================
    if (sub === "buybg") {
      const id = interaction.options.getString("id");

      const item = await redis.hgetall(`shop:bg:${id}`);
      if (!item?.price)
        return interaction.reply({ content: "❌ Not found", ephemeral: true });

      const bal = await getBal();

      if (bal < Number(item.price))
        return interaction.reply({ content: "❌ Not enough coins", ephemeral: true });

      await takeBal(userId, Number(item.price));
      await redis.sadd(`bg:owned:${userId}`, id);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("🛍️ Purchased")
            .setDescription(`You bought **${id}**`)
        ]
      });
    }

    // =========================
    // 🎨 EQUIP BG
    // =========================
    if (sub === "equipbg") {
      const id = interaction.options.getString("id");

      const owned = await redis.sismember(`bg:owned:${userId}`, id);

      if (!owned)
        return interaction.reply({ content: "❌ You don't own this background", ephemeral: true });

      await redis.hset(`profile:${userId}`, "bg", id);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle("🎨 Equipped")
            .setDescription(`Background set to **${id}**`)
        ]
      });
    }
  }
};

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

    // ======================
    // BASIC
    // ======================
    .addSubcommand(s =>
      s.setName("balance").setDescription("Check coins")
    )

    .addSubcommand(s =>
      s.setName("daily").setDescription("Daily reward")
    )

    // ======================
    // GAMES
    // ======================
    .addSubcommand(s =>
      s.setName("rps")
        .setDescription("Rock Paper Scissors")
        .addIntegerOption(o =>
          o.setName("bet").setDescription("Bet").setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("coinflip")
        .setDescription("Flip coin")
        .addIntegerOption(o =>
          o.setName("bet").setDescription("Bet").setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("dice")
        .setDescription("Dice game")
        .addIntegerOption(o =>
          o.setName("bet").setDescription("Bet").setRequired(true)
        )
    )

    // ======================
    // CASH
    // ======================
    .addSubcommand(s =>
      s.setName("sendcash")
        .setDescription("Send coins")
        .addUserOption(o =>
          o.setName("user").setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("amount").setRequired(true)
        )
    )

    // ======================
    // SHOP
    // ======================
    .addSubcommand(s =>
      s.setName("shop")
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
    )

    // ======================
    // ADMIN
    // ======================
    .addSubcommand(s =>
      s.setName("addbg")
        .setDescription("Add background (admin)")
        .addStringOption(o =>
          o.setName("id").setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("price").setRequired(true)
        )
        .addAttachmentOption(o =>
          o.setName("image").setRequired(true)
        )
    ),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    const DEVELOPER_ID = "1303357369622990889";

    // ======================
    // HELPERS
    // ======================
    const getBal = async () =>
      Number(await redis.get(`eco:${guildId}:${userId}:money`) || 0);

    const addBal = (amt) =>
      redis.incrby(`eco:${guildId}:${userId}:money`, amt);

    const takeBal = (amt) =>
      redis.decrby(`eco:${guildId}:${userId}:money`, amt);

    // ======================
    // BALANCE
    // ======================
    if (sub === "balance") {
      const coins = await getBal();

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#F1C40F")
            .setTitle("💰 Wallet")
            .setDescription(`Coins: **${coins}**`)
        ]
      });
    }

    // ======================
    // DAILY
    // ======================
    if (sub === "daily") {
      const key = `daily:${userId}`;
      const last = await redis.get(key);

      if (last && Date.now() - last < 86400000)
        return interaction.reply({ content: "⏳ Already claimed", flags: [MessageFlags.Ephemeral] });

      const reward = Math.floor(Math.random() * 100) + 1;

      await addBal(reward);
      await redis.set(key, Date.now());

      return interaction.reply(`🎁 You got **${reward} coins**`);
    }

    // ======================
    // SHOP VIEW
    // ======================
    if (sub === "shop") {
      const keys = await redis.keys("shop:bg:*");

      if (!keys.length)
        return interaction.reply("❌ No backgrounds available");

      const embeds = [];

      for (const key of keys) {
        const id = key.split(":")[2];
        const item = await redis.hgetall(key);

        embeds.push({
          title: `🖼 ${id}`,
          description: `Price: **${item.price} coins**\nUse: /game buybg ${id}`,
          image: { url: item.url }
        });
      }

      return interaction.reply({ embeds: embeds.slice(0, 10) });
    }

    // ======================
    // BUY BACKGROUND
    // ======================
    if (sub === "buybg") {
      const id = interaction.options.getString("id");

      const item = await redis.hgetall(`shop:bg:${id}`);
      if (!item?.price) return interaction.reply("❌ Invalid ID");

      const bal = await getBal();

      if (bal < Number(item.price))
        return interaction.reply("❌ Not enough coins");

      await takeBal(Number(item.price));

      await redis.sadd(`bg:owned:${userId}`, id);
      await redis.hset(`profile:${userId}`, "bg", id);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("✅ Purchased")
            .setDescription(`You bought **${id}**`)
            .setImage(item.url)
        ]
      });
    }

    // ======================
    // EQUIP BACKGROUND
    // ======================
    if (sub === "equipbg") {
      const id = interaction.options.getString("id");

      const owned = await redis.sismember(`bg:owned:${userId}`, id);
      if (!owned) return interaction.reply("❌ You don't own this");

      await redis.hset(`profile:${userId}`, "bg", id);

      return interaction.reply(`✅ Equipped **${id}**`);
    }

    // ======================
    // ADMIN ADD BG
    // ======================
    if (sub === "addbg") {
      if (userId !== DEVELOPER_ID)
        return interaction.reply({ content: "❌ No permission", flags: [MessageFlags.Ephemeral] });

      const id = interaction.options.getString("id");
      const price = interaction.options.getInteger("price");
      const file = interaction.options.getAttachment("image");

      if (!file.contentType?.startsWith("image/"))
        return interaction.reply("❌ Invalid image");

      await redis.hset(`shop:bg:${id}`, {
        price,
        url: file.url
      });

      return interaction.reply(`🛒 Added **${id}** to shop`);
    }

    // ======================
    // GAME COMMANDS (short)
    // ======================
    if (sub === "coinflip" || sub === "dice" || sub === "rps") {
      return interaction.reply("Game system already exists in your file (keep yours)");
    }

    // ======================
    // SEND CASH
    // ======================
    if (sub === "sendcash") {
      const target = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");

      const bal = await getBal();

      if (amount > bal)
        return interaction.reply("❌ Not enough coins");

      await takeBal(amount);
      await redis.incrby(`eco:${guildId}:${target.id}:money`, amount);

      return interaction.reply(`💸 Sent **${amount} coins** to ${target.username}`);
    }
  }
};

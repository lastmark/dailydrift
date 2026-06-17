const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Economy system with shop & games")

    // ======================
    // BASIC
    // ======================
    .addSubcommand(s =>
      s.setName("balance")
        .setDescription("Check your coins")
    )

    .addSubcommand(s =>
      s.setName("daily")
        .setDescription("Claim daily reward")
    )

    // ======================
    // GAMES
    // ======================
    .addSubcommand(s =>
      s.setName("rps")
        .setDescription("Rock Paper Scissors")
        .addIntegerOption(o =>
          o.setName("bet")
            .setDescription("Amount to bet")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("coinflip")
        .setDescription("Flip a coin")
        .addIntegerOption(o =>
          o.setName("bet")
            .setDescription("Amount to bet")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("dice")
        .setDescription("Roll dice")
        .addIntegerOption(o =>
          o.setName("bet")
            .setDescription("Amount to bet")
            .setRequired(true)
        )
    )

    // ======================
    // CASH
    // ======================
    .addSubcommand(s =>
      s.setName("sendcash")
        .setDescription("Send coins to a user")
        .addUserOption(o =>
          o.setName("user")
            .setDescription("Recipient user")
            .setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("amount")
            .setDescription("Amount to send")
            .setRequired(true)
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
        .setDescription("Buy a background")
        .addStringOption(o =>
          o.setName("id")
            .setDescription("Background ID")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("equipbg")
        .setDescription("Equip a background")
        .addStringOption(o =>
          o.setName("id")
            .setDescription("Background ID")
            .setRequired(true)
        )
    )

    // ======================
    // ADMIN
    // ======================
    .addSubcommand(s =>
      s.setName("addbg")
        .setDescription("Add background (admin only)")
        .addStringOption(o =>
          o.setName("id")
            .setDescription("Background ID")
            .setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("price")
            .setDescription("Price in coins")
            .setRequired(true)
        )
        .addAttachmentOption(o =>
          o.setName("image")
            .setDescription("Background image")
            .setRequired(true)
        )
    ),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    const DEVELOPER_ID = "1303357369622990889";

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
          description: `Price: **${item.price} coins**`,
          image: { url: item.url }
        });
      }

      return interaction.reply({ embeds: embeds.slice(0, 10) });
    }

    // ======================
    // BUY BG
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

      return interaction.reply(`✅ Bought **${id}**`);
    }

    // ======================
    // EQUIP BG
    // ======================
    if (sub === "equipbg") {
      const id = interaction.options.getString("id");

      const owned = await redis.sismember(`bg:owned:${userId}`, id);
      if (!owned) return interaction.reply("❌ Not owned");

      await redis.hset(`profile:${userId}`, "bg", id);

      return interaction.reply(`✅ Equipped **${id}**`);
    }

    // ======================
    // ADD BG
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

      return interaction.reply(`🛒 Added **${id}**`);
    }
  }
};

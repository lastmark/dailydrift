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

    .addSubcommand(s => s.setName("balance").setDescription("Check coins"))
    .addSubcommand(s => s.setName("daily").setDescription("Daily reward"))

    .addSubcommand(s =>
      s.setName("shop").setDescription("View background shop")
    )

    .addSubcommand(s =>
      s.setName("buybg")
        .setDescription("Buy background")
        .addStringOption(o =>
          o.setName("id").setDescription("Background ID").setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("equipbg")
        .setDescription("Equip background")
        .addStringOption(o =>
          o.setName("id").setDescription("Background ID").setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("addbg")
        .setDescription("Admin add background")
        .addStringOption(o =>
          o.setName("id").setDescription("ID").setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("price").setDescription("Price").setRequired(true)
        )
        .addAttachmentOption(o =>
          o.setName("image").setDescription("Image").setRequired(true)
        )
    ),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    const DEV_ID = "1303357369622990889";

    const getBal = async () =>
      Number(await redis.get(`eco:${userId}:money`) || 0);

    const addBal = (a) => redis.incrby(`eco:${userId}:money`, a);
    const takeBal = (a) => redis.decrby(`eco:${userId}:money`, a);

    // ================= BALANCE =================
    if (sub === "balance") {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#F1C40F")
            .setTitle("💰 Wallet")
            .setDescription(`Coins: **${await getBal()}**`)
        ]
      });
    }

    // ================= DAILY =================
    if (sub === "daily") {
      const key = `daily:${userId}`;
      const last = await redis.get(key);

      if (last && Date.now() - last < 86400000)
        return interaction.reply({
          content: "⏳ Already claimed",
          flags: [MessageFlags.Ephemeral]
        });

      const reward = Math.floor(Math.random() * 100) + 1;
      await addBal(reward);
      await redis.set(key, Date.now());

      return interaction.reply(`🎁 +${reward} coins`);
    }

    // ================= SHOP =================
    if (sub === "shop") {
      const keys = await redis.keys("shop:bg:*");

      if (!keys.length)
        return interaction.reply("❌ No backgrounds");

      const embeds = [];

      for (const k of keys) {
        const id = k.split(":")[2];
        const item = await redis.hgetall(k);

        embeds.push({
          title: `🖼 ${id}`,
          description: `💰 ${item.price} coins`,
          image: { url: item.url }
        });
      }

      return interaction.reply({ embeds });
    }

    // ================= BUY BG =================
    if (sub === "buybg") {
      const id = interaction.options.getString("id");
      const item = await redis.hgetall(`shop:bg:${id}`);

      if (!item?.price)
        return interaction.reply("❌ Invalid ID");

      const bal = await getBal();
      if (bal < Number(item.price))
        return interaction.reply("❌ Not enough coins");

      await takeBal(Number(item.price));
      await redis.sadd(`bg:owned:${userId}`, id);
      await redis.hset(`profile:${userId}`, "bg", id);

      return interaction.reply(`✅ Bought **${id}**`);
    }

    // ================= EQUIP BG =================
    if (sub === "equipbg") {
      const id = interaction.options.getString("id");

      const owned = await redis.sismember(`bg:owned:${userId}`, id);
      if (!owned)
        return interaction.reply("❌ You don't own it");

      await redis.hset(`profile:${userId}`, "bg", id);

      return interaction.reply(`✅ Equipped **${id}**`);
    }

    // ================= ADD BG =================
    if (sub === "addbg") {
      if (userId !== DEV_ID)
        return interaction.reply({
          content: "❌ No permission",
          flags: [MessageFlags.Ephemeral]
        });

      const id = interaction.options.getString("id");
      const price = interaction.options.getInteger("price");
      const file = interaction.options.getAttachment("image");

      await redis.hset(`shop:bg:${id}`, {
        price: String(price),
        url: file.url
      });

      return interaction.reply(`🛒 Added **${id}**`);
    }
  }
};

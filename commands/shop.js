// commands/shop.js – Working Shop (MongoDB, fixed balance deduction)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags
} = require("discord.js");

const SHOP_ITEMS = {
  shield: {
    name: "🛡️ Counting Shield",
    price: 200,
    description: "Protects your counting streak from a single mistake.",
    action: async (db, userId) => {
      const current = Number(await db.get(`eco:${userId}:shield`) || 0);
      await db.set(`eco:${userId}:shield`, current + 1);
    }
  },
  double: {
    name: "⚡ Double XP Card",
    price: 500,
    description: "Grants 5 charges of double XP multipliers inside games.",
    action: async (db, userId) => {
      await db.set(`eco:${userId}:double`, 5);
    }
  }
};

module.exports = {
  category: "Economy",
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View available upgrades and premium counting perks"),

  async execute(interaction, client, db) {
    const userId = interaction.user.id;
    const wallet = Number(await db.get(`eco:${userId}:money`) || 0);

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🛒 Inventory Catalog")
      .setDescription(`💰 **Your Balance:** \`${wallet.toLocaleString()}\` coins`)
      .addFields(
        ...Object.entries(SHOP_ITEMS).map(([id, item]) => ({
          name: `${item.name} — \`${item.price}\` coins`,
          value: item.description,
          inline: false
        }))
      )
      .setFooter({ text: "Select an item below to purchase." });

    const menuOptions = Object.entries(SHOP_ITEMS).map(([id, item]) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(item.name.replace(/[^\w\s]/g, '').trim())
        .setDescription(`${item.price} coins`)
        .setValue(`shop_buy_${id}`)
        .setEmoji(item.name.split(" ")[0])
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("shop_menu_select")
      .setPlaceholder("Select an item to purchase...")
      .addOptions(menuOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return interaction.reply({ embeds: [embed], components: [row] });
  },

  async handleMenu(interaction, db) {
    if (interaction.customId !== "shop_menu_select") return;

    const selectedValue = interaction.values[0];
    if (!selectedValue.startsWith("shop_buy_")) return;

    const itemId = selectedValue.split("_")[2];
    const item = SHOP_ITEMS[itemId];
    if (!item) return interaction.reply({ content: "❌ Item not found.", flags: MessageFlags.Ephemeral });

    const userId = interaction.user.id;
    let wallet = Number(await db.get(`eco:${userId}:money`) || 0);

    if (wallet < item.price) {
      return interaction.reply({
        content: `❌ You need **${item.price}** coins but only have **${wallet.toLocaleString()}**.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Atomic deduction + item action
    await db.incrby(`eco:${userId}:money`, -item.price);
    await item.action(db, userId);

    // Re‑read balance after deduction
    wallet = Number(await db.get(`eco:${userId}:money`) || 0);

    const embed = new EmbedBuilder()
      .setColor("#57F287")
      .setTitle("✅ Purchase Successful!")
      .setDescription(`You bought **${item.name}** for **${item.price}** coins.`)
      .addFields(
        { name: "📦 Acquired", value: item.name, inline: true },
        { name: "💰 New Balance", value: `\`${wallet.toLocaleString()}\` coins`, inline: true }
      );

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};

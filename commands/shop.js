// commands/shop.js – Premium Components V2 Economy Shop System
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder
} = require("discord.js");

// ---------- Configured Shop Items Inventory ----------
const SHOP_ITEMS = {
  shield: {
    name: "🛡️ Counting Shield",
    price: 200,
    description: "Protects your server's counting streak from a single mistake.",
    redisKey: (userId) => `eco:${userId}:shield`,
    action: async (redis, userId) => {
      await redis.incr(`eco:${userId}:shield`);
    }
  },
  double: {
    name: "⚡ Double XP Card",
    price: 500,
    description: "Grants 5 charges of double XP multipliers inside games.",
    redisKey: (userId) => `eco:${userId}:double`,
    action: async (redis, userId) => {
      await redis.set(`eco:${userId}:double`, 5);
    }
  }
};

module.exports = {
  category: "Economy",
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View available upgrades and premium counting perks"),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const balanceKey = `eco:${userId}:money`;
    const wallet = Number(await redis.get(balanceKey) || 0);

    // Build the aesthetic catalog showcase display string
    let inventoryCatalog = [
      `🛒 **PREMIUM INVENTORY CATALOG**`,
      `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`,
      `💰 **Your Current Balance:** \`${wallet.toLocaleString()}\` coins`,
      ``,
      `✨ **Available Upgrades:**`
    ];

    for (const [id, item] of Object.entries(SHOP_ITEMS)) {
      inventoryCatalog.push(`• **${item.name}** — \`${item.price}\` coins\n  ↳ *${item.description}*`);
    }

    inventoryCatalog.push(`\n*Select an item below from the menu to purchase instantly.*`);

    const textBlock = new TextDisplayBuilder().setContent(inventoryCatalog.join("\n"));

    // Build modern select menu items
    const menuOptions = Object.entries(SHOP_ITEMS).map(([id, item]) => 
      new StringSelectMenuOptionBuilder()
        .setLabel(item.name.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim()) // strips emoji for raw text limits
        .setDescription(`${item.price} coins — ${item.description.slice(0, 50)}`)
        .setValue(`shop_buy_${id}`)
        .setEmoji(item.name.split(" ")[0])
    );

    const actionRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("shop_menu_select")
        .setPlaceholder("Select a perk item to buy...")
        .addOptions(menuOptions)
    );

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2) // Aesthetic dark blue blurple
      .addTextDisplayComponents(textBlock)
      .addActionRowComponents(actionRow);

    return interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  },

  // =============================================================================
  // V2 Menu Selector Handle Processor Interceptor Pipeline
  // =============================================================================
  async handleMenu(interaction, redis) {
    if (interaction.customId !== "shop_menu_select") return;

    const selectedValue = interaction.values[0];
    if (!selectedValue.startsWith("shop_buy_")) return;

    const itemId = selectedValue.split("_")[2];
    const item = SHOP_ITEMS[itemId];
    if (!item) return interaction.reply({ content: "❌ Item asset missing from global inventory index.", flags: MessageFlags.Ephemeral });

    const userId = interaction.user.id;
    const balanceKey = `eco:${userId}:money`;
    let wallet = Number(await redis.get(balanceKey) || 0);

    if (wallet < item.price) {
      return interaction.reply({
        content: `❌ Transaction declined. You need **${item.price}** coins but currently hold **${wallet.toLocaleString()}**.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Execute standard atomic ledger deduction and assign perks
    wallet -= item.price;
    await redis.set(balanceKey, wallet);
    await item.action(redis, userId);

    const successContent = [
      `✅ **PURCHASE SUCCESSFUL!**`,
      `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`,
      `📦 **Acquired:** ${item.name}`,
      `💰 **Debited:** \`-${item.price}\` coins`,
      `💳 **Remaining Ledger Balance:** \`${wallet.toLocaleString()}\` coins`
    ].join("\n");

    const textBlock = new TextDisplayBuilder().setContent(successContent);
    const container = new ContainerBuilder()
      .setAccentColor(0x57F287) // Success Emerald Green
      .addTextDisplayComponents(textBlock);

    // Update the layout context natively 
    return interaction.update({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  }
};

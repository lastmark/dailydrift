// commands/daily.js – Randomized Daily Allowance Engine
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  category: "Economy",
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily allocation of credits"),
    
  async execute(interaction, client, db) {
    const userId = interaction.user.id;
    const cooldownKey = `daily:${userId}`;
    const balanceKey = `eco:${userId}:money`;
    
    const lastClaim = await db.get(cooldownKey);
    const now = Date.now();
    const COOLDOWN_TIME = 24 * 60 * 60 * 1000; // 24 Hours in milliseconds

    // Evaluate active cooldown restriction
    if (lastClaim && (now - Number(lastClaim) < COOLDOWN_TIME)) {
      const remaining = COOLDOWN_TIME - (now - Number(lastClaim));
      const hours = Math.floor(remaining / (3600000));
      const minutes = Math.floor((remaining % 3600000) / 60000);
      
      const embed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription(`⏳ **Timeframe Lock:** Secure terminal link refused. Re-attempt allocation access in **${hours}h ${minutes}m**.`);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Determine premium multiplier metadata status
    const isPremium = await db.get(`premium:user:${userId}`);
    
    // Generate randomized payout value explicitly bounded between 200 and 1,500 coins
    let baseCoins = Math.floor(Math.random() * (1500 - 200 + 1)) + 200;
    let finalPayout = isPremium ? baseCoins * 3 : baseCoins;

    // Fetch current wallet volume and calculate modern total increments
    const currentBalance = Number(await db.get(balanceKey) || 0);
    
    // Database write operations
    await db.set(cooldownKey, now);
    await db.set(balanceKey, currentBalance + finalPayout);

    const embed = new EmbedBuilder()
      .setColor("#0A0A0A") // Dark premium aesthetic interface layout
      .setTitle("☀️ Daily Yield Transferred")
      .setDescription(`Your profile account wallet node has been credited with systemic financial resources.`)
      .addFields(
        { name: "💰 Generated Allocation", value: `\`+${finalPayout.toLocaleString()}\` coins`, inline: true },
        { name: "💳 Current Net Assets", value: `\`${(currentBalance + finalPayout).toLocaleString()}\` coins`, inline: true }
      )
      .setFooter({ 
        text: isPremium 
          ? "💎 Premium multi-tier authorization flag applied: Value scaled at (3x)" 
          : "Standard tier account signature logged. Core network cycle refresh: 24h" 
      })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};

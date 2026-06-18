// commands/balance.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Economy = require("../economy.js");

module.exports = {
  category: "Economy",
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription(" Check your balance and economy stats")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Check another user's balance")
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser("user") || interaction.user;
    const userId = targetUser.id;
    
    const economy = new Economy(redis);

    // Get all economy data
    const balance = await economy.getBalance(userId);
    const shield = await economy.getShield(userId);
    const doubleXP = await economy.getDoubleXP(userId);
    const vip = await economy.getVIP(userId);
    const totalEarned = await economy.getTotalEarned(userId);
    const totalSpent = await economy.getTotalSpent(userId);

    // Create embed
    const embed = economy.createBalanceEmbed(targetUser, balance, {
      shield,
      doubleXP,
      totalEarned,
      totalSpent,
      color: "#FFD700"
    });

    // Add additional fields for the user
    if (userId === interaction.user.id) {
      embed.setDescription("💰 Here's your current economy status");
    } else {
      embed.setDescription(`💰 ${targetUser.username}'s economy status`);
    }

    // Get rank
    const allBalances = await redis.keys('eco:*:money');
    let rank = 1;
    for (const key of allBalances) {
      const id = key.split(':')[1];
      const bal = Number(await redis.get(key) || 0);
      if (bal > balance) rank++;
    }

    embed.addFields({
      name: "🏆 Global Rank",
      value: `\`#${rank} / ${allBalances.length}\``,
      inline: true
    });

    return interaction.editReply({ embeds: [embed] });
  }
};

// commands/daily.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  category: "Economy",
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily coins"),
  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const cooldownKey = `daily:${userId}`;
    const last = await redis.get(cooldownKey);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (last && (now - Number(last) < cooldown)) {
      const remaining = cooldown - (now - Number(last));
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      return interaction.reply({
        content: `⏳ You already claimed your daily reward. Come back in **${hours}h ${minutes}m**.`,
        flags: MessageFlags.Ephemeral
      });
    }

    const isPremium = await redis.get(`premium:user:${userId}`);
    let coins = 200; // base
    if (isPremium) coins = 600; // 3x for premium

    await redis.set(cooldownKey, now);
    await redis.incrby(`eco:${userId}:money`, coins);

    const embed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("☀️ Daily Reward")
      .setDescription(`You received **${coins}** coins!`)
      .setFooter({ text: isPremium ? "Premium multiplier applied (3x)" : "Come back in 24 hours for more" });

    return interaction.reply({ embeds: [embed] });
  }
};

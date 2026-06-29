const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "messageCreate",
  async execute(message, client, redis) {
    // 🛑 Hard safeguards: Ignore bots, system messages, and DMs
    if (message.author.bot || !message.guild || message.system) return;

    const userId = message.author.id;
    const guildId = message.guild.id;
    
    // ⏳ Cooldown key is SERVER-SPECIFIC to prevent multi-server spam exploits
    const cooldownKey = `xp:cooldown:${guildId}:${userId}`;

    // Check if the user is on chat cooldown
    const hasCooldown = await redis.get(cooldownKey);
    if (hasCooldown) return;

    // Set a strict 60-second database-side anti-spam expiration window
    await redis.setex(cooldownKey, 60, "true");

    // 🌐 User Profile data is GLOBAL across all servers the bot is in
    const profileKey = `profile:${userId}`;
    
    // Pull existing level tracking fields from the Redis Hash Map
    let currentLevel = parseInt(await redis.hget(profileKey, "level")) || 1;
    let currentXp = parseInt(await redis.hget(profileKey, "xp")) || 0;

    // Hard leveling milestone cap ceiling
    if (currentLevel >= 120) return;

    // Award a random experience weight between 15 and 25 points per minute
    const xpGained = Math.floor(Math.random() * 11) + 15;
    currentXp += xpGained;

    // Non-linear scaling formula curve calculation matching your database matrix
    const xpNeededForNextLevel = Math.floor(100 * Math.pow(currentLevel, 1.8));

    // ⚡ Level Up Event Check Loop
    if (currentXp >= xpNeededForNextLevel) {
      currentXp -= xpNeededForNextLevel;
      currentLevel += 1;

      // ---- Dynamic Scaling Economy Reward Matrix ----
      // Formula: 10,000 base coins * (New Level - 1)
      // Level 2 = 10,000 | Level 3 = 20,000 | Level 4 = 30,000 | Level 120 = 1,190,000
      const baseReward = 10000;
      const coinBonus = baseReward * (currentLevel - 1);

      // Process wallet updates securely in Redis
      const balanceKey = `eco:${userId}:money`;
      const currentWallet = Number(await redis.get(balanceKey) || 0);
      await redis.set(balanceKey, currentWallet + coinBonus);

      // Commit the newly achieved level integers back to global Redis storage
      await redis.hset(profileKey, "level", currentLevel);
      
      // Dispatch a gorgeous level up celebration alert block to the chat grid
      const lvlUpEmbed = new EmbedBuilder()
        .setColor("#5865F2")
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setDescription(
          `⚡ **Level Up!** You have advanced to **Level ${currentLevel}**!\n` +
          `💰 **Level Reward:** \`+${coinBonus.toLocaleString()}\` coins have been added to your vault.\n\n` +
          `💎 Keep talking to reach the elite **Level 120** milestone.`
        );
      
      message.channel.send({ embeds: [lvlUpEmbed] }).catch(() => null);
    }

    // Save the finalized experience points to Redis
    await redis.hset(profileKey, "xp", currentXp);
  }
};

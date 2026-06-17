// games/counting.js - Updated version with unified economy
const { EmbedBuilder } = require("discord.js");
const Economy = require("../economy.js");

module.exports = async (message, redis) => {
  const guildId = message.guild.id;
  const userId = message.author.id;
  const economy = new Economy(redis);
  
  // ... (keep all your existing game logic, just update economy parts)
  
  // =========================
  // SUCCESS PIPELINE - Use unified economy
  // =========================
  
  // ... (your existing code until economy rewards)
  
  // =========================
  // 💰 ECONOMY REWARDS (UNIFIED)
  // =========================
  const baseReward = 5;
  let bonusMultiplier = 1;
  
  // Check for double XP
  const doubleXP = await economy.getDoubleXP(userId);
  if (doubleXP > 0) {
    bonusMultiplier = 2;
    await economy.addDoubleXP(userId, -1);
    
    if (doubleXP === 1) {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xF1C40F)
            .setDescription(`⚡ <@${userId}> used their last **Double XP**! (2x coins earned!)`)
        ]
      });
    }
  }
  
  // Streak bonus (every 10 consecutive)
  if (currentStreak % 10 === 0) {
    bonusMultiplier += 0.5;
  }
  
  const totalReward = Math.floor(baseReward * bonusMultiplier);
  await economy.addBalance(userId, totalReward);
  await economy.addTotalEarned(userId, totalReward);
  
  // ... (rest of your counting logic)
};

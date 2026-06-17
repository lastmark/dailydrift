// economy.js - Create this file in your project root
const { EmbedBuilder } = require("discord.js");

class Economy {
  constructor(redis) {
    this.redis = redis;
  }

  // Get user's balance
  async getBalance(userId) {
    return Number(await this.redis.get(`eco:${userId}:money`) || 0);
  }

  // Add coins
  async addBalance(userId, amount) {
    return await this.redis.incrby(`eco:${userId}:money`, amount);
  }

  // Remove coins
  async takeBalance(userId, amount) {
    const current = await this.getBalance(userId);
    if (current < amount) return false;
    await this.redis.decrby(`eco:${userId}:money`, amount);
    return true;
  }

  // Transfer coins between users
  async transfer(fromUserId, toUserId, amount) {
    const fromBalance = await this.getBalance(fromUserId);
    if (fromBalance < amount) return false;
    
    await this.takeBalance(fromUserId, amount);
    await this.addBalance(toUserId, amount);
    return true;
  }

  // Get user's shields
  async getShield(userId) {
    return Number(await this.redis.get(`eco:${userId}:shield`) || 0);
  }

  // Add shields
  async addShield(userId, amount = 1) {
    return await this.redis.incrby(`eco:${userId}:shield`, amount);
  }

  // Remove shields
  async takeShield(userId, amount = 1) {
    const current = await this.getShield(userId);
    if (current < amount) return false;
    await this.redis.decrby(`eco:${userId}:shield`, amount);
    return true;
  }

  // Get double XP uses
  async getDoubleXP(userId) {
    return Number(await this.redis.get(`eco:${userId}:double`) || 0);
  }

  // Add double XP
  async addDoubleXP(userId, amount = 1) {
    return await this.redis.incrby(`eco:${userId}:double`, amount);
  }

  // Get user's VIP status
  async getVIP(userId) {
    return await this.redis.get(`eco:${userId}:vip`) === 'true';
  }

  // Set VIP status
  async setVIP(userId, status) {
    await this.redis.set(`eco:${userId}:vip`, status.toString());
  }

  // Get user's total earned
  async getTotalEarned(userId) {
    return Number(await this.redis.get(`eco:${userId}:total_earned`) || 0);
  }

  // Add to total earned
  async addTotalEarned(userId, amount) {
    return await this.redis.incrby(`eco:${userId}:total_earned`, amount);
  }

  // Get user's total spent
  async getTotalSpent(userId) {
    return Number(await this.redis.get(`eco:${userId}:total_spent`) || 0);
  }

  // Add to total spent
  async addTotalSpent(userId, amount) {
    return await this.redis.incrby(`eco:${userId}:total_spent`, amount);
  }

  // Create balance embed for /balance command
  createBalanceEmbed(user, balance, options = {}) {
    const embed = new EmbedBuilder()
      .setColor(options.color || "#5865F2")
      .setAuthor({
        name: `${user.username}'s Wallet`,
        iconURL: user.displayAvatarURL()
      })
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { 
          name: "💰 Coins", 
          value: `\`${balance.toLocaleString()}\``, 
          inline: true 
        }
      );

    // Add optional fields
    if (options.shield !== undefined) {
      embed.addFields({
        name: "🛡️ Shields",
        value: `\`${options.shield}\``,
        inline: true
      });
    }

    if (options.doubleXP !== undefined) {
      embed.addFields({
        name: "⚡ Double XP Uses",
        value: `\`${options.doubleXP}\``,
        inline: true
      });
    }

    if (options.vip) {
      embed.addFields({
        name: "👑 VIP Status",
        value: `\`✅ Active\``,
        inline: true
      });
    }

    if (options.totalEarned) {
      embed.addFields({
        name: "📈 Total Earned",
        value: `\`${options.totalEarned.toLocaleString()}\``,
        inline: true
      });
    }

    if (options.totalSpent) {
      embed.addFields({
        name: "💸 Total Spent",
        value: `\`${options.totalSpent.toLocaleString()}\``,
        inline: true
      });
    }

    embed.setFooter({ 
      text: `Requested by ${user.username}`,
      iconURL: user.displayAvatarURL()
    }).setTimestamp();

    return embed;
  }
}

module.exports = Economy;

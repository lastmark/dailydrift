// economy.js – MongoDB-backed Economy Engine
const { EmbedBuilder } = require("discord.js");

class Economy {
  constructor(db) {
    this.db = db.client.db();
    this.collection = this.db.collection("profiles");
  }

  // Helper to get or create profile
  async _getProfile(userId) {
    return await this.collection.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, balance: 0, shield: 0, double: 0, vip: false, total_earned: 0, total_spent: 0 } },
      { upsert: true, returnDocument: 'after' }
    );
  }

  async getBalance(userId) {
    const profile = await this.collection.findOne({ userId });
    return profile?.balance || 0;
  }

  async addBalance(userId, amount) {
    const result = await this.collection.findOneAndUpdate(
      { userId },
      { $inc: { balance: amount, total_earned: amount } },
      { upsert: true, returnDocument: 'after' }
    );
    return result.balance;
  }

  async takeBalance(userId, amount) {
    const profile = await this.collection.findOne({ userId });
    if (!profile || profile.balance < amount) return false;

    await this.collection.updateOne(
      { userId },
      { $inc: { balance: -amount, total_spent: amount } }
    );
    return true;
  }

  async transfer(fromUserId, toUserId, amount) {
    const fromProfile = await this.collection.findOne({ userId: fromUserId });
    if (!fromProfile || fromProfile.balance < amount) return false;

    await this.takeBalance(fromUserId, amount);
    await this.addBalance(toUserId, amount);
    return true;
  }

  async getShield(userId) {
    const profile = await this.collection.findOne({ userId });
    return profile?.shield || 0;
  }

  async addShield(userId, amount = 1) {
    await this.collection.updateOne({ userId }, { $inc: { shield: amount } }, { upsert: true });
  }

  async takeShield(userId, amount = 1) {
    const profile = await this.collection.findOne({ userId });
    if (!profile || profile.shield < amount) return false;
    await this.collection.updateOne({ userId }, { $inc: { shield: -amount } });
    return true;
  }

  async getDoubleXP(userId) {
    const profile = await this.collection.findOne({ userId });
    return profile?.double || 0;
  }

  async addDoubleXP(userId, amount = 1) {
    await this.collection.updateOne({ userId }, { $inc: { double: amount } }, { upsert: true });
  }

  async getVIP(userId) {
    const profile = await this.collection.findOne({ userId });
    return !!profile?.vip;
  }

  async setVIP(userId, status) {
    await this.collection.updateOne({ userId }, { $set: { vip: Boolean(status) } }, { upsert: true });
  }

  // Statistics
  async getTotalEarned(userId) { return (await this.collection.findOne({ userId }))?.total_earned || 0; }
  async getTotalSpent(userId) { return (await this.collection.findOne({ userId }))?.total_spent || 0; }

  // Embed Builder remains consistent
  createBalanceEmbed(user, balance, options = {}) {
    const embed = new EmbedBuilder()
      .setColor(options.color || "#0A0A0A")
      .setAuthor({ name: `${user.username}'s Wallet`, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL())
      .addFields({ name: "💰 Coins", value: `\`${balance.toLocaleString()}\``, inline: true });

    if (options.shield !== undefined) embed.addFields({ name: "🛡️ Shields", value: `\`${options.shield}\``, inline: true });
    if (options.doubleXP !== undefined) embed.addFields({ name: "⚡ Double XP", value: `\`${options.doubleXP}\``, inline: true });
    if (options.vip) embed.addFields({ name: "👑 VIP Status", value: `\`✅ Active\``, inline: true });
    if (options.totalEarned) embed.addFields({ name: "📈 Total Earned", value: `\`${options.totalEarned.toLocaleString()}\``, inline: true });
    if (options.totalSpent) embed.addFields({ name: "💸 Total Spent", value: `\`${options.totalSpent.toLocaleString()}\``, inline: true });

    return embed.setFooter({ text: `Requested by ${user.username}`, iconURL: user.displayAvatarURL() }).setTimestamp();
  }
}

module.exports = Economy;

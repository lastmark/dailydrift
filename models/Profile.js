const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  guildId: { type: String, required: true },
  
  // Economy
  balance: { type: Number, default: 0 },
  total_earned: { type: Number, default: 0 },
  total_spent: { type: Number, default: 0 },
  shield: { type: Number, default: 0 },
  double: { type: Number, default: 0 },
  vip: { type: Boolean, default: false },
  
  // Leveling
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  
  // Progression/Inventory
  achievements: { type: [String], default: [] },
  activityFeed: { type: [String], default: [] },
  
  // Metadata
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Profile', ProfileSchema);

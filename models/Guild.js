// models/Guild.js
const mongoose = require('mongoose');

const GuildSchema = new mongoose.Schema({
  guildId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  // Audit Logs
  auditLogChannel: { type: String, default: null },
  
  // Welcome/Leave System
  welcomeChannel: { type: String, default: null },
  welcomeBgUrl: { type: String, default: null },
  leaveBgUrl: { type: String, default: null },
  
  // Server Config
  premium: { type: Boolean, default: false },
  prefix: { type: String, default: "!" },
  language: { type: String, default: "en" }
});

module.exports = mongoose.model('Guild', GuildSchema);

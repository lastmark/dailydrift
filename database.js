const mongoose = require('mongoose');
const Profile = require('./models/Profile');
const Guild = require('./models/Guild');
const { mongoUri } = require('./config');

// Connect to Mongo once when the bot starts
mongoose.connect(mongoUri);

module.exports = {
  // Your old "db.get" calls will now hit this function
  get: async (key) => {
    const parts = key.split(':');
    
    // Example: "auditlog:12345" -> Guild Model
    if (parts[0] === 'auditlog') {
      const g = await Guild.findOne({ guildId: parts[1] });
      return g?.auditLogChannel;
    }
    
    // Example: "eco:12345:money" -> Profile Model
    if (parts[0] === 'eco') {
      const p = await Profile.findOne({ userId: parts[1] });
      if (parts[2] === 'money') return p?.balance || 0;
      if (parts[2] === 'shield') return p?.shield || 0;
    }
    return null;
  },

  // Your old "db.set" calls will now hit this function
  set: async (key, value) => {
    const parts = key.split(':');
    if (parts[0] === 'auditlog') {
      await Guild.findOneAndUpdate(
        { guildId: parts[1] },
        { auditLogChannel: value },
        { upsert: true }
      );
    }
    // ... add more mappings as needed
  }
};

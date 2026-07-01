const Profile = require('./models/Profile');
const Guild = require('./models/Guild');

module.exports = {
  // GET: Maps legacy keys to MongoDB queries
  get: async (key) => {
    const parts = key.split(':');
    const scope = parts[0];
    async keys(pattern) {
  // Assumes you have a Mongoose model named "Data" for key‑value storage
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  const docs = await Data.find({ key: { $regex: regex } });
  return docs.map(d => d.key);
}

    // Example: "eco:12345:money"
    if (scope === 'eco') {
      const userId = parts[1];
      const field = parts[2];
      const p = await Profile.findOne({ userId });
      if (!p) return null;
      return p[field] || 0;
    }

    // Example: "auditlog:guildId"
    if (scope === 'auditlog') {
      const guildId = parts[1];
      const g = await Guild.findOne({ guildId });
      return g?.auditLogChannel || null;
    }

    // Example: "maintenance:guildId"
    if (scope === 'maintenance') {
      const guildId = parts[1];
      const g = await Guild.findOne({ guildId });
      return g?.maintenanceMode ? "true" : "false";
    }

    return null;
  },

  // SET: Maps legacy keys to MongoDB updates
  set: async (key, value) => {
    const parts = key.split(':');
    const scope = parts[0];

    if (scope === 'eco') {
      const userId = parts[1];
      const field = parts[2];
      await Profile.findOneAndUpdate(
        { userId },
        { [field]: value },
        { upsert: true, new: true }
      );
    }

    if (scope === 'auditlog') {
      await Guild.findOneAndUpdate(
        { guildId: parts[1] },
        { auditLogChannel: value },
        { upsert: true }
      );
    }
  },

  // ADD: For numerical increments (like money)
  incr: async (key, amount = 1) => {
    const parts = key.split(':');
    if (parts[0] === 'eco') {
      await Profile.findOneAndUpdate(
        { userId: parts[1] },
        { $inc: { [parts[2]]: amount } },
        { upsert: true }
      );
    }
  }
};

const Profile = require('./models/Profile');
const Guild = require('./models/Guild');
const KeyValue = require('./models/KeyValue'); // new generic key‑value model

module.exports = {
  // ── STRING GET ──
  async get(key) {
    // try domain models first
    const parts = key.split(':');
    const scope = parts[0];

    if (scope === 'eco') {
      const userId = parts[1];
      const field = parts[2];
      const p = await Profile.findOne({ userId });
      return p ? (p[field] || 0) : null;
    }

    if (scope === 'auditlog') {
      const guildId = parts[1];
      const g = await Guild.findOne({ guildId });
      return g?.auditLogChannel || null;
    }

    if (scope === 'maintenance') {
      const guildId = parts[1];
      const g = await Guild.findOne({ guildId });
      return g?.maintenanceMode ? "true" : "false";
    }

    // fallback: generic key‑value store
    const doc = await KeyValue.findOne({ key });
    return doc ? doc.value : null;
  },

  // ── STRING SET ──
  async set(key, value) {
    const parts = key.split(':');
    const scope = parts[0];

    // domain models
    if (scope === 'eco') {
      const userId = parts[1];
      const field = parts[2];
      await Profile.findOneAndUpdate(
        { userId },
        { [field]: value },
        { upsert: true, new: true }
      );
      return 'OK';
    }

    if (scope === 'auditlog') {
      await Guild.findOneAndUpdate(
        { guildId: parts[1] },
        { auditLogChannel: value },
        { upsert: true }
      );
      return 'OK';
    }

    // fallback: generic store
    await KeyValue.findOneAndUpdate(
      { key },
      { value },
      { upsert: true, new: true }
    );
    return 'OK';
  },

  // ── DELETE ──
  async del(key) {
    const parts = key.split(':');
    const scope = parts[0];

    if (scope === 'eco') {
      // reset field to 0? We'll just ignore for now.
      return 1;
    }

    await KeyValue.deleteOne({ key });
    return 1;
  },

  // ── INCRBY ──
  async incrby(key, increment) {
    const parts = key.split(':');
    if (scope === 'eco') {
      const userId = parts[1];
      const field = parts[2];
      const profile = await Profile.findOneAndUpdate(
        { userId },
        { $inc: { [field]: increment } },
        { upsert: true, new: true }
      );
      return profile[field];
    }

    // generic
    const doc = await KeyValue.findOne({ key });
    if (!doc) {
      await KeyValue.create({ key, value: increment });
      return increment;
    }
    const newVal = Number(doc.value) + increment;
    doc.value = newVal;
    await doc.save();
    return newVal;
  },

  // ── KEYS (pattern search) ──
  async keys(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const docs = await KeyValue.find({ key: { $regex: regex } });
    return docs.map(d => d.key);
  }
};

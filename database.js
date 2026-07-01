// database.js – Key‑value wrapper (no more eco‑Profile coupling)
const Profile = require('./models/Profile');
const Guild = require('./models/Guild');
const KeyValue = require('./models/KeyValue'); // generic key‑value collection

module.exports = {
  // ── GET ──
  async get(key) {
    const parts = key.split(':');
    const scope = parts[0];

    // domain‑specific keys
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
    // all other keys (eco, tickets, warnings, etc.) use KeyValue
    const doc = await KeyValue.findOne({ key });
    return doc ? doc.value : null;
  },

  // ── SET ──
  async set(key, value) {
    const parts = key.split(':');
    const scope = parts[0];

    if (scope === 'auditlog') {
      await Guild.findOneAndUpdate(
        { guildId: parts[1] },
        { auditLogChannel: value },
        { upsert: true }
      );
      return 'OK';
    }

    // everything else goes to KeyValue
    await KeyValue.findOneAndUpdate(
      { key },
      { value },
      { upsert: true, new: true }
    );
    return 'OK';
  },

  // ── DELETE ──
  async del(key) {
    await KeyValue.deleteOne({ key });
    return 1;
  },

  // ── INCRBY ──
  async incrby(key, increment) {
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

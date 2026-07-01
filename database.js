// database.js – Full MongoDB wrapper (main bot, with Profile & Guild)
const Profile = require('./models/Profile');
const Guild = require('./models/Guild');
const KeyValue = require('./models/KeyValue');   // generic key‑value store

module.exports = {
  // ── STRING ──
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

  async set(key, value) {
    const parts = key.split(':');
    const scope = parts[0];

    // domain‑specific
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

  async del(key) {
    await KeyValue.deleteOne({ key });
    return 1;
  },

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

  async ttl(key) {
    return -1;   // generic TTL not implemented (use expire)
  },

  async expire(key, seconds) {
    const expiresAt = new Date(Date.now() + seconds * 1000);
    await KeyValue.findOneAndUpdate({ key }, { expiresAt }, { upsert: true });
    return 1;
  },

  // ── HASH ──
  async hset(key, fieldOrObj, value) {
    let doc = await KeyValue.findOne({ key });
    if (!doc) doc = new KeyValue({ key, value: {} });
    let hash = doc.value || {};
    if (typeof fieldOrObj === 'object') {
      for (const [k, v] of Object.entries(fieldOrObj)) hash[k] = v;
    } else {
      hash[fieldOrObj] = value;
    }
    doc.value = hash;
    await doc.save();
    return 1;
  },

  async hget(key, field) {
    const doc = await KeyValue.findOne({ key });
    return doc?.value?.[field] ?? null;
  },

  async hgetall(key) {
    const doc = await KeyValue.findOne({ key });
    return doc?.value ?? {};
  },

  async hdel(key, field) {
    const doc = await KeyValue.findOne({ key });
    if (!doc?.value) return 0;
    delete doc.value[field];
    await doc.save();
    return 1;
  },

  // ── SET ──
  async sadd(key, member) {
    let doc = await KeyValue.findOne({ key });
    if (!doc) doc = new KeyValue({ key, value: [] });
    let arr = doc.value || [];
    if (!Array.isArray(arr)) arr = [];
    if (!arr.includes(member)) {
      arr.push(member);
      doc.value = arr;
      await doc.save();
    }
    return 1;
  },

  async srem(key, member) {
    let doc = await KeyValue.findOne({ key });
    if (!doc?.value) return 0;
    let arr = doc.value || [];
    const newArr = arr.filter(m => m !== member);
    if (newArr.length === arr.length) return 0;
    doc.value = newArr;
    await doc.save();
    return 1;
  },

  async smembers(key) {
    const doc = await KeyValue.findOne({ key });
    if (!doc) return [];
    const val = doc.value;
    return Array.isArray(val) ? val : [];
  },

  async sismember(key, member) {
    const doc = await KeyValue.findOne({ key });
    if (!doc) return false;
    const arr = doc.value || [];
    return Array.isArray(arr) && arr.includes(member);
  },

  // ── SORTED SET ──
  async zincrby(key, increment, member) {
    let doc = await KeyValue.findOne({ key });
    if (!doc) doc = new KeyValue({ key, value: [] });
    let zset = doc.value || [];
    if (!Array.isArray(zset)) zset = [];
    const entry = zset.find(e => e.member === member);
    if (entry) {
      entry.score += increment;
    } else {
      zset.push({ member, score: increment });
    }
    doc.value = zset;
    await doc.save();
    return entry ? entry.score : increment;
  },

  async zscore(key, member) {
    const doc = await KeyValue.findOne({ key });
    if (!doc) return null;
    const zset = doc.value || [];
    const entry = zset.find(e => e.member === member);
    return entry ? entry.score : null;
  },

  // ── LIST ──
  async lpush(key, value) {
    let doc = await KeyValue.findOne({ key });
    if (!doc) doc = new KeyValue({ key, value: [] });
    let list = doc.value || [];
    if (!Array.isArray(list)) list = [];
    list.unshift(value);
    doc.value = list;
    await doc.save();
    return list.length;
  },

  async ltrim(key, start, stop) {
    const doc = await KeyValue.findOne({ key });
    if (!doc?.value || !Array.isArray(doc.value)) return;
    doc.value = doc.value.slice(start, stop + 1);
    await doc.save();
  },

  async lrange(key, start, stop) {
    const doc = await KeyValue.findOne({ key });
    if (!doc?.value || !Array.isArray(doc.value)) return [];
    return doc.value.slice(start, stop + 1);
  },

  // ── KEYS ──
  async keys(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const docs = await KeyValue.find({ key: { $regex: regex } });
    return docs.map(d => d.key);
  }
};

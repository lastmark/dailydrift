// database.js
const mongoose = require("mongoose");

// Connect to MongoDB using an environment variable
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🌐 Connected cleanly to MongoDB Cluster"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// A flexible Key-Value / Hash schema to handle various bot parameters seamlessly
const StorageSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }, // Handles strings, arrays, objects
  updatedAt: { type: Date, default: Date.now }
});

const Storage = mongoose.model("Storage", StorageSchema);

// Custom client-wrapper mapping Redis commands directly to clean Mongo queries
const db = {
  get: async (key) => {
    const doc = await Storage.findOne({ key });
    return doc ? doc.value : null;
  },
  set: async (key, value) => {
    await Storage.findOneAndUpdate({ key }, { value, updatedAt: Date.now() }, { upsert: true });
  },
  del: async (key) => {
    await Storage.deleteOne({ key });
  },
  incr: async (key) => {
    const doc = await Storage.findOneAndUpdate(
      { key },
      { $inc: { value: 1 }, updatedAt: Date.now() },
      { upsert: true, new: true }
    );
    return doc.value;
  },
  // Hash sets (Redis hset/hgetall fallback emulation)
  hset: async (key, fieldOrObj, value) => {
    let current = (await db.get(key)) || {};
    if (typeof fieldOrObj === "object") {
      current = { ...current, ...fieldOrObj };
    } else {
      current[fieldOrObj] = value;
    }
    await db.set(key, current);
  },
  hgetall: async (key) => {
    return (await db.get(key)) || {};
  },
  // Sets arrays (Redis sadd/srem/smembers/sismember fallback emulation)
  sadd: async (key, member) => {
    let current = (await db.get(key)) || [];
    if (!Array.isArray(current)) current = [];
    if (!current.includes(member)) {
      current.push(member);
      await db.set(key, current);
    }
  },
  srem: async (key, member) => {
    let current = (await db.get(key)) || [];
    if (!Array.isArray(current)) return;
    current = current.filter(m => m !== member);
    await db.set(key, current);
  },
  smembers: async (key) => {
    return (await db.get(key)) || [];
  },
  sismember: async (key, member) => {
    const current = (await db.get(key)) || [];
    return Array.isArray(current) && current.includes(member);
  },
  scard: async (key) => {
    const current = (await db.get(key)) || [];
    return Array.isArray(current) ? current.length : 0;
  },
  keys: async (pattern) => {
    // Converts basic redis wildcards like giveaway:* to clean Regex queries
    const regexStr = "^" + pattern.replace(/\*/g, ".*") + "$";
    const docs = await Storage.find({ key: { $regex: new RegExp(regexStr) } });
    return docs.map(d => d.key);
  }
};

module.exports = db;

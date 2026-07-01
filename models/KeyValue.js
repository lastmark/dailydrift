// models/KeyValue.js – Generic key‑value store (used by the db wrapper for fallback & keys search)
const mongoose = require('mongoose');

const keyValueSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
});

module.exports = mongoose.model('KeyValue', keyValueSchema);

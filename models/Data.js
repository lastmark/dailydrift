// models/Data.js
const mongoose = require('mongoose');
const dataSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
  expiresAt: Date
});
dataSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto‑delete
module.exports = mongoose.model('Data', dataSchema);

const mongoose = require('mongoose');
const { mongoUri } = require('./config'); // Make sure your URI is in config.js

const connectDB = async () => {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000 // Fails fast if connection is bad
    });
    console.log("✅ Successfully connected to MongoDB Atlas");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1); // Stop the bot if it can't connect
  }
};

module.exports = connectDB;

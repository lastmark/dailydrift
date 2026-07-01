// mongoose.js – Robust MongoDB connection
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/modbot', {
      // Mongoose 7+ no longer needs these, but keep for safety
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1); // stop bot if no database
  }
};

module.exports = connectDB;

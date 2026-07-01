// config.js – Global Configuration
require("dotenv").config();

module.exports = {
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  
  // Database Configuration
  mongoUri: process.env.MONGO_URI, // Migrated from REDIS_URL
  
  // Identity & Permissions
  devId: "1303357369622990889",
  TERMS_VERSION: "1.0",
  
  // Economy Module Constants
  ECONOMY: {
    MINIMUM_BALANCE: 0,
    DEFAULT_BALANCE: 1000,
    SHIELD_PRICE: 200,
    DOUBLE_XP_PRICE: 500,
    DAILY_BONUS: 50,
  }
};

module.exports = {
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  redisUrl: process.env.REDIS_URL,
  devId: "1303357369622990889",
  ECONOMY: {
    MINIMUM_BALANCE: 0,
    DEFAULT_BALANCE: 1000, // Starting coins for new users
    SHIELD_PRICE: 200,
    DOUBLE_XP_PRICE: 500,
    DAILY_BONUS: 50,
    MIN_BET: 10,
    MAX_BET: 1000
  }
};

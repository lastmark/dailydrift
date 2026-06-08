const Redis = require("ioredis");
const { redisUrl } = require("./config");

const redis = new Redis(redisUrl);

module.exports = redis;

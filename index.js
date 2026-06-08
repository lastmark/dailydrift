require("dotenv").config();
const { ShardingManager } = require("discord.js");

// Use sharding for 1M+ guilds
const manager = new ShardingManager("./bot.js", { token: process.env.DISCORD_TOKEN, totalShards: "auto" });
manager.on("shardCreate", shard => console.log(`Launching shard ${shard.id}`));
manager.spawn();

// The actual bot code (bot.js) – because of sharding, we separate.
// But for simplicity, you can put all the above in a single file? No – ShardingManager spawns separate processes.
// Create a second file "bot.js" with the client logic.

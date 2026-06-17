// migrate.js – Run once to merge old balances into global keys
const redis = require("./redis");

async function migrateBalances(guildId) {
  console.log(`🔍 Scanning for guild-specific balances (guild: ${guildId})...`);

  const pattern = `eco:${guildId}:*:money`;
  const keys = await redis.keys(pattern);

  if (keys.length === 0) {
    console.log("✅ No guild-specific balances found. Nothing to migrate.");
    return;
  }

  let totalMigrated = 0;
  let userCount = 0;

  for (const key of keys) {
    const parts = key.split(':');
    const userId = parts[2]; // format: eco:guildId:userId:money
    const oldBalance = Number(await redis.get(key) || 0);

    if (oldBalance > 0) {
      await redis.incrby(`eco:${userId}:money`, oldBalance);
      await redis.del(key);
      totalMigrated += oldBalance;
      userCount++;
      console.log(`✅ Migrated ${oldBalance} coins for user ${userId}`);
    } else {
      await redis.del(key); // clean up zero balances
    }
  }

  console.log(`\n🎉 Migration complete!`);
  console.log(`📊 ${userCount} users migrated, total coins: ${totalMigrated}`);
}

// ============================================
// 🛠️ REPLACE THIS WITH YOUR GUILD ID
// ============================================
const GUILD_ID = "1319429710094270554"; // e.g., "123456789012345678"

if (GUILD_ID === "1319429710094270554") {
  console.error("❌ Please replace GUILD_ID with your actual server ID.");
  process.exit(1);
}

migrateBalances(GUILD_ID)
  .then(() => process.exit(0))
  .catch(err => {
    console.error("❌ Migration error:", err);
    process.exit(1);
  });

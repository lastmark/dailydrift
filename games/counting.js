const Economy = require("../economy");

module.exports = async (message, redis) => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  const countingChannel =
    await redis.get(`counting:${guildId}:channel`);

  if (!countingChannel) return;
  if (message.channel.id !== countingChannel) return;

  const economy = new Economy(redis);

  const countKey = `count:${guildId}`;
  const lastUserKey = `counting:${guildId}:lastUser`;

  const current = Number(await redis.get(countKey) || 0);
  const expected = current + 1;

  const number = Number(message.content);

  if (isNaN(number)) return;

  const lastUser = await redis.get(lastUserKey);

  // same user twice
  if (lastUser === userId) {
    await message.react("❌");

    await redis.set(countKey, 0);
    await redis.del(lastUserKey);

    return;
  }

  // wrong number
  if (number !== expected) {
    await message.react("❌");

    await redis.set(countKey, 0);
    await redis.del(lastUserKey);

    await redis.zincrby(
      `counting:${guildId}:sabotages`,
      1,
      userId
    );

    return;
  }

  // correct number
  await message.react("✅");

  await redis.set(countKey, number);
  await redis.set(lastUserKey, userId);

  await redis.zincrby(
    `counting:${guildId}:scores`,
    1,
    userId
  );

  const streakKey =
    `counting:${guildId}:${userId}:streak`;

  const currentStreak =
    await redis.incr(streakKey);

  const highscoreKey =
    `counting:${guildId}:${userId}:highscore`;

  const highscore =
    Number(await redis.get(highscoreKey) || 0);

  if (currentStreak > highscore) {
    await redis.set(
      highscoreKey,
      currentStreak
    );
  }

  // Economy reward
  const baseReward = 5;

  let multiplier = 1;

  const doubleXP =
    await economy.getDoubleXP(userId);

  if (doubleXP > 0) {
    multiplier = 2;
    await economy.addDoubleXP(userId, -1);
  }

  if (currentStreak % 10 === 0) {
    multiplier += 0.5;
  }

  const reward =
    Math.floor(baseReward * multiplier);

  await economy.addBalance(
    userId,
    reward
  );

  await economy.addTotalEarned(
    userId,
    reward
  );
};

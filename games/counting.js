module.exports = async (message, redis) => {
  const key = `count:${message.guild.id}`;

  const lastUser = await redis.get(`${key}:user`);
  const lastNumber = parseInt(await redis.get(key) || "0");

  const expected = lastNumber + 1;

  if (message.author.id === lastUser) {
    await message.react("❌");
    await redis.set(key, 0);
    return message.channel.send("Reset: same user twice.");
  }

  if (parseInt(message.content) !== expected) {
    await message.react("❌");
    await redis.set(key, 0);
    return message.channel.send("Wrong number reset.");
  }

  await redis.set(key, expected);
  await redis.set(`${key}:user`, message.author.id);
  await message.react("✅");
};

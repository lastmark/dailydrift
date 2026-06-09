module.exports = async (message, redis) => {
  const key = `count:${message.guild.id}`;

  const lastUser = await redis.get(`${key}:user`);
  const lastNumber = parseInt(await redis.get(key) || "0");
  const expected = lastNumber + 1;

  // 1. Math Evaluation Logic
  let userNumber;
  const cleanContent = message.content.replace(/\s+/g, ""); // Strip spaces (e.g., "1 + 1" -> "1+1")

  // Check if the message contains math characters (+, -, *, /, ^)
  if (/[\+\-\*\/\^]/.test(cleanContent)) {
    try {
      // Safe mathematical evaluation using Function constructor (avoids harmful eval loops)
      // Replaces '^' with '**' for exponents safely
      const mathExpression = cleanContent.replace(/\^/g, "**");
      userNumber = Function(`"use strict"; return (${mathExpression})`)();
    } catch (err) {
      // If it looks like math but is invalid formatting, count it as a wrong guess
      userNumber = null; 
    }
  } else {
    // If it's just a raw text input, parse it normally
    userNumber = parseInt(cleanContent);
  }

  // 2. Game Validation Rules
  if (message.author.id === lastUser) {
    await message.react("❌");
    await redis.set(key, 0);
    await redis.del(`${key}:user`);
    return message.channel.send("🚨 **Reset!** You cannot count twice in a row.");
  }

  if (userNumber !== expected) {
    await message.react("❌");
    await redis.set(key, 0);
    await redis.del(`${key}:user`);
    return message.channel.send(`🚨 **Wrong number!** Expected **${expected}**, but calculated your answer as **${userNumber || "invalid"}**. Starting over from 0.`);
  }

  // 3. Save progress on valid match
  await redis.set(key, expected);
  await redis.set(`${key}:user`, message.author.id);
  await message.react("✅");

  // 4. Custom Easter Egg Event for Number 67
  if (expected === 67) {
    await message.reply("👀 *Wait... 67? You're only 2 numbers away from greatness. Stay focused, don't mess it up now...* 🫡");
  }
};

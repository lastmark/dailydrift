const e = require("../emojis");

module.exports = async (message, redis) => {
  const key = `count:${message.guild.id}`;

  const lastUser = await redis.get(`${key}:user`);
  const lastNumber = parseInt(await redis.get(key) || "0");
  const expected = lastNumber + 1;

  let userNumber;
  const cleanContent = message.content.replace(/\s+/g, "");

  if (/[\+\-\*\/\^]/.test(cleanContent)) {
    try {
      const mathExpression = cleanContent.replace(/\^/g, "**");
      userNumber = Function(`"use strict"; return (${mathExpression})`)();
    } catch (err) {
      userNumber = null; 
    }
  } else {
    userNumber = parseInt(cleanContent);
  }

  // Helper function to handle channel purging on failure
  const handleReset = async (failReasonMessage) => {
    await message.react(e.error ? e.error.match(/\d+/)[0] : "❌"); // Dynamically pulls custom emoji ID or fallback
    await redis.set(key, 0);
    await redis.del(`${key}:user`);

    const alertMessage = await message.channel.send(failReasonMessage);

    setTimeout(async () => {
      try {
        const messages = await message.channel.messages.fetch({ limit: 100 });
        const textToDelete = messages.filter(msg => msg.id !== alertMessage.id);
        
        if (textToDelete.size > 0) {
          await message.channel.bulkDelete(textToDelete, true);
        }
      } catch (err) {
        console.error("Failed to clear counting channel on reset:", err);
      }
    }, 2000);
  };

  // Game Validation Rules
  if (message.author.id === lastUser) {
    return handleReset(`${e.error} **Reset!** <@${message.author.id}> counted twice in a row. Channel clearing...`);
  }

  if (userNumber !== expected) {
    return handleReset(`${e.error} **Wrong number!** Expected **${expected}**, but got **${userNumber || "invalid text"}**. Channel clearing...`);
  }

  // Save progress on valid match
  await redis.set(key, expected);
  await redis.set(`${key}:user`, message.author.id);
  await message.react("✅");

  // Custom Easter Egg Event for Number 67
  if (expected === 67) {
    await message.reply(`${e.bot} *Wait... 67? You're only 2 numbers away from greatness. Stay focused, don't mess it up now...* 🫡`);
  }
};

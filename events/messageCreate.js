const counting = require("../utils/games/counting");
const config = require("../config");

module.exports = async (client, message) => {
  if (message.author.bot) return;
  const state = await counting.getState(message.guild.id, message.channel.id);
  if (!state || !state.active) return;

  const num = parseInt(message.content);
  if (isNaN(num)) return;

  const expected = state.currentNumber;
  if (num === expected && state.lastUserId !== message.author.id) {
    await counting.increment(message.guild.id, message.channel.id, message.author.id);
    await message.react("✅");
  } else {
    await counting.reset(message.guild.id, message.channel.id);
    await message.react("❌");
    await message.reply(`${config.ICONS.error} Wrong! Restarting from 1. Expected ${expected}, got ${num}.`);
  }
};

const { Events, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client, redis) {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    // Concurrently fetch Premium license and Anti-Spam toggle from cache memory
    const [isPremium, antiSpamToggle] = await Promise.all([
      redis.get(`premium:guild:${guildId}`),
      redis.get(`antispam:toggle:${guildId}`)
    ]);

    // Hard drop if the guild isn't premium OR if they manually toggled the shield off via slash command
    if (!isPremium || antiSpamToggle === "false") return; 

    // Skip immune entities (Moderators / Admins)
    if (message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) return;

    // ... [Rest of your sliding window code remains exactly the same!]

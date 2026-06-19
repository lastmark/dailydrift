// events/messageReactionAdd.js – DM confirmation on entry
const { Events } = require("discord.js");

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user, client, redis) {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const message = reaction.message;
    const guildId = message.guild?.id;
    if (!guildId) return;
    const emoji = reaction.emoji.name;

    if (emoji !== '🎉') return;

    // Check if this is a giveaway
    const key = `giveaway:${guildId}:${message.channel.id}:${message.id}`;
    const data = await redis.hgetall(key);
    if (!data || data.ended === 'true') return;

    const participantKey = `giveaway:${key}:participants`;
    const isParticipant = await redis.sismember(participantKey, user.id);
    if (isParticipant) return;

    // Check max participants limit
    const maxParticipants = parseInt(data.maxParticipants) || 0;
    if (maxParticipants > 0) {
      const currentCount = await redis.scard(participantKey);
      if (currentCount >= maxParticipants) {
        await reaction.users.remove(user.id).catch(() => {});
        try {
          await user.send(`❌ The giveaway **${data.prize}** has reached its maximum of ${maxParticipants} entries.`);
        } catch {}
        return;
      }
    }

    // Add user to participants
    await redis.sadd(participantKey, user.id);
    await redis.hincrby(key, 'participantCount', 1);

    // Send DM confirmation
    try {
      await user.send(`✅ You have been entered into the giveaway for **${data.prize}**! Good luck! 🎉`);
    } catch {
      // Ignore if DMs are closed
    }
  }
};

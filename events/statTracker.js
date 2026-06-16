const { Events } = require("discord.js");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client, redis) {
    const guild = member.guild;

    const isPremium = await redis.get(`premium:guild:${guild.id}`);
    if (!isPremium || isPremium === "false") return;

    const statChannelId = await redis.get(`stats:channel:members:${guild.id}`);
    if (!statChannelId) return;

    const targetChannel = await guild.channels.fetch(statChannelId).catch(() => null);
    if (targetChannel) {
      const cleanCount = guild.memberCount.toLocaleString();
      await targetChannel.setName(`✨ ┃ Members • ${cleanCount}`).catch(() => null);
    }
  }
};

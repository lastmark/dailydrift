// events/statTracker.js – Guild Stats Auto-Updater
const { Events } = require("discord.js");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client, db) {
    const guild = member.guild;

    // Verify server premium tier line
    const isPremium = await db.get(`premium:guild:${guild.id}`);
    if (!isPremium || isPremium === "false") return;

    // Get the configured channel tracker configuration
    const statChannelId = await db.get(`stats:channel:members:${guild.id}`);
    if (!statChannelId) return;

    const targetChannel = await guild.channels.fetch(statChannelId).catch(() => null);
    if (targetChannel) {
      const cleanCount = guild.memberCount.toLocaleString();
      // Premium aesthetic counter structure
      await targetChannel.setName(`📊 ┃ members • ${cleanCount}`).catch(() => null);
    }
  }
};

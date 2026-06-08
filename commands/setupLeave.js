module.exports = {
  data: {
    name: "setleave"
  },

  async execute(interaction, client, redis) {
    await redis.set(`leave:${interaction.guild.id}`, interaction.channel.id);
    interaction.reply("Leave channel set.");
  }
};

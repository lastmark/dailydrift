module.exports = {
data: new SlashCommandBuilder()
  .setName("setLeave")
  .setDescription("set leave channel"),

  async execute(interaction, client, redis) {
    await redis.set(`leave:${interaction.guild.id}`, interaction.channel.id);
    interaction.reply("Leave channel set.");
  }
};

const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setleave")
    .setDescription("Set leave channel"),

  async execute(interaction, client, redis) {
    await redis.set(`leave:${interaction.guild.id}`, interaction.channel.id);
    return interaction.reply("Leave channel set.");
  }
};

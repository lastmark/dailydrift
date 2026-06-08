const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Set welcome channel"),

  async execute(interaction, client, redis) {
    await redis.set(`welcome:${interaction.guild.id}`, interaction.channel.id);
    interaction.reply("Welcome channel set.");
  }
};

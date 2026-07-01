// commands/ping.js
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "Utility",
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),

  async execute(interaction) {
    await interaction.reply("🏓 Pong!");
  }
};

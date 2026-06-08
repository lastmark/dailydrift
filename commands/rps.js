const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Rock Paper Scissors")
    .addStringOption(o =>
      o.setName("choice")
        .setRequired(true)
        .addChoices(
          { name: "rock", value: "rock" },
          { name: "paper", value: "paper" },
          { name: "scissors", value: "scissors" }
        )
    ),

  async execute(interaction) {
    const choices = ["rock", "paper", "scissors"];
    const bot = choices[Math.floor(Math.random() * 3)];
    const user = interaction.options.getString("choice");

    let result = "draw";
    if (
      (user === "rock" && bot === "scissors") ||
      (user === "paper" && bot === "rock") ||
      (user === "scissors" && bot === "paper")
    ) result = "win";
    else if (user !== bot) result = "lose";

    interaction.reply(`Bot: ${bot} | You: ${user} | ${result}`);
  }
};

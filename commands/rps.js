const { SlashCommandBuilder } = require("discord.js");
const e = require("../emojis");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Rock Paper Scissors")
    .addStringOption(opt =>
      opt.setName("choice")
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

    const icon =
      result === "win" ? e.money :
      result === "lose" ? e.error :
      e.coin;

    return interaction.reply(
      `${e.bot} Bot chose **${bot}**\n${e.user} You chose **${user}**\n${icon} Result: **${result.toUpperCase()}**`
    );
  }
};

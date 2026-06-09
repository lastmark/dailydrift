const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const e = require("../emojis");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Play a game of Rock, Paper, Scissors.")
    .addStringOption(opt =>
      opt
        .setName("choice")
        .setDescription("Select your move")
        .setRequired(true)
        .addChoices(
          { name: "Rock", value: "rock" },
          { name: "Paper", value: "paper" },
          { name: "Scissors", value: "scissors" }
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
    ) {
      result = "win";
    } else if (user !== bot) {
      result = "lose";
    }

    // 1. Setup clean styling variations based on match results
    let embedColor;
    let statusHeader;

    if (result === "win") {
      embedColor = 0x2ECC71; // Emerald Green
      statusHeader = "Match Finished: Victory";
    } else if (result === "lose") {
      embedColor = 0xE74C3C; // Alizarin Red
      statusHeader = "Match Finished: Defeat";
    } else {
      embedColor = 0x95A5A6; // Asbestos Gray
      statusHeader = "Match Finished: Tie/Draw";
    }

    // Capitalization utility for clean formatting
    const formatWord = (str) => str.charAt(0).toUpperCase() + str.slice(1);

    // 2. Build the minimalist minimalist embed
    const rpsEmbed = new EmbedBuilder()
      .setColor(embedColor)
      .setAuthor({ name: statusHeader })
      .addFields(
        { 
          name: "Your Selection", 
          value: `${e[user]} ${formatWord(user)}`, 
          inline: true 
        },
        { 
          name: "Bot Selection", 
          value: `${e[bot]} ${formatWord(bot)}`, 
          inline: true 
        }
      );

    return interaction.reply({ embeds: [rpsEmbed] });
  }
};

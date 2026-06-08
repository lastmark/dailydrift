const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const counting = require("../utils/games/counting");
const rps = require("../utils/games/rps");
const pictureRace = require("../utils/games/pictureRace");
const { drawPictureWord } = require("../utils/canvas");
const config = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Play games")
    .addSubcommand(sub => sub.setName("counting").setDescription("Start/stop counting").addBooleanOption(opt => opt.setName("active").setDescription("true=start, false=stop").setRequired(true)))
    .addSubcommand(sub => sub.setName("rps").setDescription("Challenge someone").addUserOption(opt => opt.setName("opponent").setDescription("Who to play against").setRequired(true)))
    .addSubcommand(sub => sub.setName("picturerace").setDescription("Guess the drawn word (first correct wins)")),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "counting") {
      const active = interaction.options.getBoolean("active");
      await counting.setActive(interaction.guildId, interaction.channelId, active);
      const icon = active ? config.ICONS.coin : config.ICONS.error;
      await interaction.reply({ content: `${icon} Counting game ${active ? "started" : "stopped"} in this channel.`, ephemeral: true });
    } 
    else if (sub === "rps") {
      const opponent = interaction.options.getUser("opponent");
      if (opponent.bot) return interaction.reply({ content: `${config.ICONS.error} You cannot challenge a bot.`, ephemeral: true });
      if (opponent.id === interaction.user.id) return interaction.reply({ content: `${config.ICONS.error} You cannot play with yourself.`, ephemeral: true });
      const challengeId = `${interaction.channelId}:${Date.now()}`;
      await rps.createChallenge(challengeId, interaction.user.id, opponent.id, interaction.channelId);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rps_accept_${challengeId}`).setLabel("Accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`rps_decline_${challengeId}`).setLabel("Decline").setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({ content: `${config.ICONS.announce} ${opponent}, you have been challenged to Rock Paper Scissors by ${interaction.user}.`, components: [row] });
    }
    else if (sub === "picturerace") {
      const word = config.PICTURE_WORDS[Math.floor(Math.random() * config.PICTURE_WORDS.length)];
      await pictureRace.startRace(interaction.channelId, word);
      const image = await drawPictureWord(word);
      await interaction.reply({ content: `${config.ICONS.search} **Picture Word Race!** First to type the correct word wins. You have 30 seconds.`, files: [image] });
    }
  }
};

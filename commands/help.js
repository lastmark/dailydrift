const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const e = require("../emojis");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all commands"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`${e.bot} Bot Command Center`)
      .setDescription(`${e.announcement} All systems available below`)

      .addFields(
        {
          name: `${e.settings} Setup`,
          value: `${e.message} \`/setwelcome\` - set welcome channel\n${e.message} \`/setleave\` - set leave channel`,
        },
        {
          name: `${e.coin} Games`,
          value:
            `${e.rock} / /rps - Rock Paper Scissors\n` +
            `${e.search} Word Race - first correct wins\n` +
            `${e.money} Counting Game - chat sequence game`,
        },
        {
          name: `${e.user} Info`,
          value: `${e.search} \`/info\` - server/user info`,
        }
      )

      .setFooter({ text: "Fast • Clean • Scalable" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Display the system feature command matrix."),

  async execute(interaction, client, redis) {
    const helpEmbed = new EmbedBuilder()
      .setColor("#2B2D31")
      .setAuthor({ name: `${client.user.username} Systems Manual`, iconURL: client.user.displayAvatarURL() })
      .addFields(
        {
          name: `${e.profile || "👤"} Profiles & Levels`,
          value: "`/profile view` • `/profile setbio`",
          inline: true
        },
        {
          name: `${e.premium || "✨"} Premium Assets`,
          value: "`/profile upload` • `/profile reset`",
          inline: true
        },
        {
          name: `${e.birthday || "🎁"} Birthdays`,
          value: "`/birthday set` • `/birthday setup`",
          inline: true
        },
        {
          name: `${e.games || "🪙"} Entertainment & Games`,
          value: "`/rps` (Rock, Paper, Scissors) • `/counting setup` (Set channel)",
          inline: false
        },
        {
          name: `${e.welcome || "⚙️"} Server Utilities`,
          value: "• Automated Welcome/Leave graphic tracking streams",
          inline: false
        }
      );

    return await interaction.reply({ embeds: [helpEmbed] });
  }
};

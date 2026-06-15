const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("📖 View the complete list of available features and command modules."),

  async execute(interaction, client, redis) {
    const avatarURL = client.user.displayAvatarURL();

    const helpEmbed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle(`📚 ${client.user.username} Command Directory`)
      .setDescription(
        "Welcome to the official feature network manual. Below you will find all public application slash commands built into the client system."
      )
      .setThumbnail(avatarURL)
      .addFields(
        {
          name: "👤 User Profiles & Progression",
          value: 
            "• `/profile view [target]` - Render your aesthetic graphical profile canvas card.\n" +
            "• `/profile setbio <text>` - Modify your personal database biography message (Max 80 chars).\n" +
            "• 🔥 *Earn XP automatically every 60 seconds by chatting in any public channel!*",
          inline: false
        },
        {
          name: "✨ Premium Utility Perks",
          value: 
            "• `/profile upload <image>` - Upload a custom 800x300 background layer directly into your profile card.\n" +
            "• `/profile reset` - Instantly clear out your custom background image record.",
          inline: false
        },
        {
          name: "🎂 Birthday Celebrations",
          value: 
            "• `/birthday set <month> <day>` - Save your birthday date globally across the entire bot network.\n" +
            "• `⚙️` `/birthday setup [channel] [auto_create]` - Configure or auto-generate the birthday announcement channel room *(Admins Only)*.",
          inline: false
        },
        {
          name: "🪙 Automated Mini-Games",
          value: 
            "• Chat math equations or sequence digits inside the server's configured counting channel to advance the global team highscore matrix!",
          inline: false
        }
      )
      .setFooter({ text: "Tip: Parameters enclosed in [ ] are optional, while < > are strictly required.", iconURL: avatarURL })
      .setTimestamp();

    return await interaction.reply({ embeds: [helpEmbed] });
  }
};

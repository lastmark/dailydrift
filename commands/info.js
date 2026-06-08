const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Get user information")
    .addUserOption(opt => opt.setName("user").setDescription("Target user")),
  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`${config.ICONS.user} ${user.tag}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: `${config.ICONS.message} ID`, value: user.id, inline: true },
        { name: `${config.ICONS.memberAdd} Joined Server`, value: member?.joinedAt?.toDateString() || "Unknown", inline: true },
        { name: `${config.ICONS.bot} Bot`, value: user.bot ? "Yes" : "No", inline: true }
      );
    await interaction.reply({ embeds: [embed] });
  }
};

// serverinfo – similar, use config.ICONS.announce for title, etc.

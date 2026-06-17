const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View all bot commands and categories"),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    

    const color = userPremium || guildPremium ? "#FFD700" : "#5865F2";

    // Group commands by category (folder name)
    const categories = new Map();

    for (const [, command] of client.commands) {
      const name = command.data.name;
      const description = command.data.description || "No description";
      const category = command.category || "Other";

      if (!categories.has(category)) categories.set(category, []);
      categories.get(category).push(`\`/${name}\` - ${description}`);
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({
        name: `${client.user.username} Command Center`,
        iconURL: client.user.displayAvatarURL()
      })
      .setDescription(
        `${e.info} Hello ${interaction.user.username}\n\n` +
        `All available commands are listed below.`
      )
      .setTimestamp();

    // Add each category dynamically
    for (const [category, commands] of categories) {
      embed.addFields({
        name: `${e.folder || "📁"} ${category}`,
        value: commands.join("\n").slice(0, 1024) || "No commands",
        inline: false
      });
    }

    embed.setFooter({
      text: `${client.user.username} • Auto-Generated Help System`
    });

    return interaction.reply({ embeds: [embed] });
  }
};

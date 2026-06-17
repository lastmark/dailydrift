const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require("discord.js");

const e = require("../emojis.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View all bot commands"),

  async execute(interaction, client) {

    const categories = new Map();

    for (const [, command] of client.commands) {
      const category = command.category || "Other";

      if (!categories.has(category))
        categories.set(category, []);

      categories.get(category).push({
        name: command.data.name,
        description: command.data.description || "No description"
      });
    }

    const mainEmbed = new EmbedBuilder()
      .setColor("#5865F2")
      .setAuthor({
        name: `${client.user.username} Help Menu`,
        iconURL: client.user.displayAvatarURL()
      })
      .setThumbnail(client.user.displayAvatarURL())
      .setDescription(
        `Welcome ${interaction.user}!\n\n` +
        `Choose a category below.\n\n` +
        `📚 **${client.commands.size} Commands**\n` +
        `📂 **${categories.size} Categories**`
      )
      .setFooter({
        text: `${client.user.username} • Help System`
      });

    const buttons = [];
    let count = 0;

    for (const [category] of categories) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`help_${category}`)
          .setLabel(category)
          .setStyle(ButtonStyle.Secondary)
      );

      count++;
      if (count >= 5) break;
    }

    const row = new ActionRowBuilder().addComponents(buttons);

    const msg = await interaction.reply({
      embeds: [mainEmbed],
      components: [row],
      fetchReply: true
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000
    });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: "This help menu isn't yours.",
          ephemeral: true
        });
      }

      const category = i.customId.replace("help_", "");
      const commands = categories.get(category);

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(`📂 ${category}`)
        .setDescription(
          commands
            .map(cmd => `\`/${cmd.name}\`\n> ${cmd.description}`)
            .join("\n\n")
        );

      await i.update({
        embeds: [embed],
        components: [row]
      });
    });
  }
};

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
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

      categories.get(category).push(command);
    }

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setAuthor({
        name: `${client.user.username} Help Menu`,
        iconURL: client.user.displayAvatarURL()
      })
      .setThumbnail(client.user.displayAvatarURL())
      .setDescription(
        `Welcome ${interaction.user}!\n\n` +
        `Select a category from the dropdown below.\n\n` +
        `📚 **${client.commands.size} Commands**\n` +
        `📂 **${categories.size} Categories**`
      );

    const menu = new StringSelectMenuBuilder()
      .setCustomId("help-category")
      .setPlaceholder("Select a category");

    for (const [category, commands] of categories) {
      menu.addOptions({
        label: category,
        description: `${commands.length} commands`,
        value: category
      });
    }

    const row = new ActionRowBuilder().addComponents(menu);

    const msg = await interaction.reply({
      embeds: [embed],
      components: [row],
      fetchReply: true
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 300000
    });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: "This menu isn't yours.",
          ephemeral: true
        });
      }

      const category = i.values[0];
      const commands = categories.get(category);

      const categoryEmbed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(`📂 ${category}`)
        .setDescription(
          commands
            .map(cmd =>
              `**/${cmd.data.name}**\n${cmd.data.description || "No description"}`
            )
            .join("\n\n")
        )
        .setFooter({
          text: `${commands.length} commands`
        });

      await i.update({
        embeds: [categoryEmbed],
        components: [row]
      });
    });
  }
};

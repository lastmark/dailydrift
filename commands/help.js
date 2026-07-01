// commands/help.js – Advanced Dropdown System Directory
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType
} = require("discord.js");

module.exports = {
  category: "Information",
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View all available system command modules"),

  async execute(interaction, client, db) {
    const categories = new Map();

    // Map through the client commands cluster cache
    for (const [, command] of client.commands) {
      const category = command.category || "General";

      if (!categories.has(category)) {
        categories.set(category, []);
      }

      categories.get(category).push(command);
    }

    const embed = new EmbedBuilder()
      .setColor("#0A0A0A") // Premium dark minimalist styling layout
      .setAuthor({
        name: `${client.user.username.toUpperCase()} // SYSTEM INDEX`,
        iconURL: client.user.displayAvatarURL()
      })
      .setThumbnail(client.user.displayAvatarURL())
      .setDescription(
        `Welcome <@${interaction.user.id}>.\n\n` +
        `Select a data sector path from the selection menu component drop below to inspect commands.\n\n` +
        `⚡ **Matrix Index:** \`${client.commands.size}\` commands logged\n` +
        `📂 **Sectors Partitioned:** \`${categories.size}\` distinct categories`
      )
      .setFooter({ text: "OPERATIONAL DIRECTORY ACTIVE" })
      .setTimestamp();

    const menu = new StringSelectMenuBuilder()
      .setCustomId("help_category")
      .setPlaceholder("Select system sector link...");

    for (const [category, commands] of categories) {
      menu.addOptions({
        label: category.toUpperCase(),
        description: `Inspect directory containing [${commands.length}] modules`,
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
      time: 300000 // 5-minute tracking lease length
    });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: "❌ Access Denied: This interaction link is restricted to the execution user node.",
          ephemeral: true
        });
      }

      const category = i.values[0];
      const commands = categories.get(category);

      const categoryEmbed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle(`📂 Sector Partition: ${category.toUpperCase()}`)
        .setDescription(
          commands
            .map(cmd =>
              `**\`/${cmd.data.name}\`**\n*${cmd.data.description || "No systemic description logged for this script."}*`
            )
            .join("\n\n")
        )
        .setFooter({
          text: `Total localized elements: ${commands.length}`
        })
        .setTimestamp();

      await i.update({
        embeds: [categoryEmbed],
        components: [row]
      });
    });

    // Clean up interface components smoothly when collector window drops offline
    collector.on("end", async () => {
      const disabledMenu = StringSelectMenuBuilder.from(menu).setDisabled(true).setPlaceholder("Link expired. Re-execute command.");
      const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);
      
      await interaction.editReply({
        components: [disabledRow]
      }).catch(() => null);
    });
  }
};

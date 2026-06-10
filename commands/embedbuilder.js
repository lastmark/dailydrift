const { 
  SlashCommandBuilder, 
  ChannelSelectMenuBuilder, 
  ActionRowBuilder, 
  ChannelType, 
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("embedbuilder")
    .setDescription("Launch an interactive form to design and send a professional embed message."),

  async execute(interaction) {
    // Step 1: Create a dropdown menu to select the destination channel
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId("embed_target_channel")
      .setPlaceholder("Select the destination channel...")
      .addChannelTypes(ChannelType.GuildText);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    // Send the dropdown to the user (ephemeral so only they see the builder)
    const response = await interaction.reply({
      content: "🔧 **Embed Builder Initialized.** Please select the channel where you want to publish the embed:",
      components: [row],
      ephemeral: true
    });

    // Step 2: Listen for the channel selection
    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.ChannelSelect,
      time: 60000 // 1 minute timeout
    });

    collector.on("collect", async (menuInteraction) => {
      const selectedChannelId = menuInteraction.values[0];

      // Step 3: Build the interactive pop-up form (Modal)
      // We encode the target channel ID into the custom ID of the modal so we don't lose track of it!
      const modal = new ModalBuilder()
        .setCustomId(`embed_modal:${selectedChannelId}`)
        .setTitle("Design Your Custom Embed");

      // Form Field 1: Title
      const titleInput = new TextInputBuilder()
        .setCustomId("embed_title")
        .setLabel("Embed Title")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter a striking title...")
        .setRequired(true);

      // Form Field 2: Description (Main Text Body)
      const descInput = new TextInputBuilder()
        .setCustomId("embed_description")
        .setLabel("Main Message / Description")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Type your main content here. Supports standard Markdown text.")
        .setRequired(true);

      // Form Field 3: Hex Color code
      const colorInput = new TextInputBuilder()
        .setCustomId("embed_color")
        .setLabel("Sidebar Color Accent (Hex Code)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g., #2B2D31 or #FF4500 (Leave blank for default)")
        .setRequired(false);

      // Form Field 4: Footer text
      const footerInput = new TextInputBuilder()
        .setCustomId("embed_footer")
        .setLabel("Footer Text")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Small text appearing at the very bottom...")
        .setRequired(false);

      // Add inputs to action rows
      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(colorInput),
        new ActionRowBuilder().addComponents(footerInput)
      );

      // Show the pop-up modal directly to the user
      await menuInteraction.showModal(modal);
    });
  }
};

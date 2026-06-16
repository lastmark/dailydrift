const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("responder-set")
    .setDescription("📊 Configure custom rich embed auto-responder blocks for your community.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt => opt.setName("trigger").setDescription("Keyword trigger phrase (e.g. !ip)").setRequired(true))
    .addStringOption(opt => opt.setName("title").setDescription("Embed block Title header layout string").setRequired(true))
    .addStringOption(opt => opt.setName("reply").setDescription("The main descriptive text lines inside your embed").setRequired(true))
    .addStringOption(opt => opt.setName("color").setDescription("Optional custom hex code color accent (e.g., #00FFAC)")),

  async execute(interaction, client, redis) {
    const guildId = interaction.guildId;

    const trigger = interaction.options.getString("trigger").trim().toLowerCase();
    const title = interaction.options.getString("title");
    const reply = interaction.options.getString("reply");
    const colorInput = interaction.options.getString("color") || "#2B2D31";

    // Validate custom color hex input format string safely if they passed one over
    let finalColor = colorInput;
    if (colorInput !== "#2B2D31" && !/^#[0-9A-F]{6}$/i.test(colorInput)) {
      finalColor = "#2B2D31"; // Fallback to standard sleek dark gray if they messed up the code
    }

    const responderPayload = JSON.stringify({ title, reply, color: finalColor });
    await redis.set(`responder:${guildId}:${trigger}`, responderPayload);

    return interaction.reply({ 
      content: `✅ **Auto-Responder Configured:** Typing out \`${trigger}\` inside a text channel will now deploy your custom interactive embed asset.` 
    });
  }
};

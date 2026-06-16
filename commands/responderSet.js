const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("responder-set")
    .setDescription("💎 Premium Only: Create custom rich embed response blocks.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt => opt.setName("trigger").setDescription("Keyword trigger (e.g. !ip)").setRequired(true))
    .addStringOption(opt => opt.setName("title").setDescription("Embed Title header").setRequired(true))
    .addStringOption(opt => opt.setName("reply").setDescription("The main display text lines inside embed").setRequired(true))
    .addStringOption(opt => opt.setName("color").setDescription("Embed border color in hex")),

  async execute(interaction, client, redis) {
    const guildId = interaction.guildId;

    const isGuildPremium = await redis.get(`premium:guild:${guildId}`);
    if (!isGuildPremium || isGuildPremium === "false") {
      return interaction.reply({ content: "🔒 **License Required:** Custom Auto-Responders are restricted to premium nodes.", flags: [MessageFlags.Ephemeral] });
    }

    const trigger = interaction.options.getString("trigger").toLowerCase();
    const title = interaction.options.getString("title");
    const reply = interaction.options.getString("reply");
    const color = interaction.options.getString("color") || "#2B2D31";

    const responderPayload = JSON.stringify({ title, reply, color });
    await redis.set(`responder:${guildId}:${trigger}`, responderPayload);

    return interaction.reply({ content: `✅ **Responder Set Up Successfully!** Typing \`${trigger}\` will now deploy this rich asset.` });
  }
};

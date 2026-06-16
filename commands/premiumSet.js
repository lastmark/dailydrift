const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("premium-set")
    .setDescription("💎 Premium Suite: Configure advanced server matrices.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("antispam")
        .setDescription("⚡ Toggle high-speed anti-spam protection shield.")
        .addStringOption(opt =>
          opt.setName("status")
            .setDescription("Turn the protection stream ON or OFF")
            .setRequired(true)
            .addChoices(
              { name: "Enabled (Active Shielding)", value: "true" },
              { name: "Disabled (Unprotected Stream)", value: "false" }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("setup-stats")
        .setDescription("📊 Deploy dynamic live server statistics tracker channels.")
        .addChannelOption(opt => opt.setName("voice_channel").setDescription("Select channel to turn into a counter").setRequired(true))
    ),

  async execute(interaction, client, redis) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    const isGuildPremium = await redis.get(`premium:guild:${guildId}`);
    if (!isGuildPremium || isGuildPremium === "false") {
      const accessDeniedEmbed = new EmbedBuilder()
        .setColor("#FF3366")
        .setTitle("🔒 Premium License Required")
        .setDescription("This system configuration utility belongs exclusively to **Premium Tier Guilds**.\n\n💰 Contact the application developer to activate a premium subscription.");
      return interaction.reply({ embeds: [accessDeniedEmbed], flags: [MessageFlags.Ephemeral] });
    }

    if (subcommand === "antispam") {
      const statusValue = interaction.options.getString("status");
      await redis.set(`antispam:toggle:${guildId}`, statusValue);

      const isEnabled = statusValue === "true";
      const configEmbed = new EmbedBuilder()
        .setColor(isEnabled ? "#00FFAC" : "#FF3366")
        .setDescription(`**Anti-Spam State Updated:**\n• **System Status:** ${isEnabled ? "🟢 **MAXIMUM ACTIVE SHIELDING**" : "🔴 **INACTIVE**"}`);
      return interaction.reply({ embeds: [configEmbed] });
    }

    if (subcommand === "setup-stats") {
      const targetChannel = interaction.options.getChannel("voice_channel");
      await redis.set(`stats:channel:members:${guildId}`, targetChannel.id);
      return interaction.reply({ content: `✅ **Data Sync Completed:** Channel ${targetChannel} will now display real-time cinematic count logs.` });
    }
  }
};

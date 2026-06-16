const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("premium-set")
    .setDescription("💎 Premium Suite: Configure advanced server matrices.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // Requires Server Admin/Manager access
    .addSubcommand(sub =>
      sub.setName("antispam")
        .setDescription("⚡ Toggle the maximum performance high-speed anti-spam protection shield.")
        .addStringOption(opt =>
          opt.setName("status")
            .setDescription("Turn the protection stream ON or OFF")
            .setRequired(true)
            .addChoices(
              { name: "Enabled (Active Shielding)", value: "true" },
              { name: "Disabled (Unprotected Stream)", value: "false" }
            )
        )
    ),

  async execute(interaction, client, redis) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    // ─── CRITICAL SECURITY HARD GUARD: PREMIUM LICENSE CHECK ───
    const isGuildPremium = await redis.get(`premium:guild:${guildId}`);
    if (!isGuildPremium) {
      const accessDeniedEmbed = new EmbedBuilder()
        .setColor("#FF3366")
        .setTitle("🔒 Premium License Required")
        .setDescription(
          `This system configuration utility belongs exclusively to **Premium Tier Guilds**.\n\n` +
          `💰 **Unlock Access:** Contact the application developer to activate a high-performance premium license subscription for this server.`
        )
        .setFooter({ text: "Maximum Performance Streams • Security Core" });

      return interaction.reply({ embeds: [accessDeniedEmbed], flags: [MessageFlags.Ephemeral] });
    }

    // ─── SUBCOMMAND: ANTI-SPAM TOGGLE ───
    if (subcommand === "antispam") {
      const statusValue = interaction.options.getString("status");
      
      // Update the toggle switch in Redis memory storage
      await redis.set(`antispam:toggle:${guildId}`, statusValue);

      const isEnabled = statusValue === "true";
      const configEmbed = new EmbedBuilder()
        .setColor(isEnabled ? "#00FFAC" : "#FF3366")
        .setDescription(
          `${isEnabled ? (e.check || "✅") : (e.error || "❌")} **Anti-Spam State Updated:**\n` +
          `• **System Status:** ${isEnabled ? "🟢 **MAXIMUM ACTIVE SHIELDING**" : "🔴 **INACTIVE / BYPASSED**"}\n` +
          `• **Tracking Engine:** Sliding-Window Rate Limiter (Redis Vector)`
        )
        .setTimestamp();

      return interaction.reply({ embeds: [configEmbed] });
    }
  }
};

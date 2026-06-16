const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, MessageFlags } = require("discord.js");

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
        .setDescription("📊 Setup live tracker channels (Select an existing channel OR create a new one).")
        .addChannelOption(opt => 
          opt.setName("target_channel")
            .setDescription("Option A: Choose an existing voice channel to convert into the counter.")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false)
        )
        .addStringOption(opt => 
          opt.setName("create_prefix")
            .setDescription("Option B: Type a naming prefix to create a brand new channel (e.g., 👥 ┃ Members).")
            .setRequired(false)
        )
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

    // ==========================================
    // ⚡ SUBCOMMAND: ANTI-SPAM
    // ==========================================
    if (subcommand === "antispam") {
      const statusValue = interaction.options.getString("status");
      await redis.set(`antispam:toggle:${guildId}`, statusValue);

      const isEnabled = statusValue === "true";
      const configEmbed = new EmbedBuilder()
        .setColor(isEnabled ? "#00FFAC" : "#FF3366")
        .setDescription(`**Anti-Spam State Updated:**\n• **System Status:** ${isEnabled ? "🟢 **MAXIMUM ACTIVE SHIELDING**" : "🔴 **INACTIVE**"}`);
      return interaction.reply({ embeds: [configEmbed] });
    }

    // ==========================================
    // 📊 SUBCOMMAND: SETUP STATS
    // ==========================================
    if (subcommand === "setup-stats") {
      await interaction.deferReply();

      const targetChannel = interaction.options.getChannel("target_channel");
      const createPrefix = interaction.options.getString("create_prefix");
      const currentCount = interaction.guild.memberCount.toLocaleString();

      let activeChannelId = null;
      let displayMessage = "";

      // Fallback logic if user provided absolutely no choices
      if (!targetChannel && !createPrefix) {
        return interaction.editReply({ 
          content: "❌ **Configuration Error:** You must provide at least one option! Either select a `target_channel` or define a `create_prefix`." 
        });
      }

      // 🔄 CASE 1: User chose an existing voice channel
      if (targetChannel) {
        activeChannelId = targetChannel.id;
        displayMessage = `✅ **Data Sync Completed:** Connected to existing channel ${targetChannel}. It will now log real-time counts.`;
        
        // Instant initialization rename
        await targetChannel.setName(`✨ ┃ Members • ${currentCount}`).catch(() => null);
      } 
      // 🛠️ CASE 2: User wants the bot to auto-create a brand new channel
      else if (createPrefix) {
        const cleanName = `${createPrefix} • ${currentCount}`;
        
        const newChannel = await interaction.guild.channels.create({
          name: cleanName,
          type: ChannelType.GuildVoice,
          permissionOverwrites: [
            {
              id: interaction.guild.roles.everyone.id,
              deny: [PermissionFlagsBits.Connect], // Keep it locked so users treat it like an aesthetic status board
            },
          ],
        }).catch(() => null);

        if (!newChannel) {
          return interaction.editReply({ content: "❌ **Permissions Error:** Unsuccessful creating a voice channel asset. Ensure my application roles have channel generation rights." });
        }

        activeChannelId = newChannel.id;
        displayMessage = `🛠️ **Dynamic Channel Deployed:** Successfully generated brand new voice asset <#${newChannel.id}> with template formatting structure hooks!`;
      }

      // Save whichever channel ID was activated straight into the Redis memory core
      await redis.set(`stats:channel:members:${guildId}`, activeChannelId);
      return interaction.editReply({ content: displayMessage });
    }
  }
};

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("premium-set")
    .setDescription("💎 Premium Suite: Configure advanced premium metrics and server protections.")
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
        .setDescription("📊 Deploy premium analytics live tracker panels.")
        .addStringOption(opt =>
          opt.setName("type")
            .setDescription("Select the advanced tracking metric type.")
            .setRequired(true)
            .addChoices(
              { name: "🎙️ Peoples in Voices", value: "voice" },
              { name: "📈 Members Joined Today", value: "today" }
            )
        )
        .addChannelOption(opt => 
          opt.setName("target_channel")
            .setDescription("Connect to an existing voice channel (Leave empty to let bot auto-create one).")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false)
        )
    ),

  async execute(interaction, client, redis) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    // Strict premium verification checking gate right at the entrypoint
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
    // 📊 SUBCOMMAND: SETUP STATS (PREMIUM MODULES)
    // ==========================================
    if (subcommand === "setup-stats") {
      await interaction.deferReply();

      const type = interaction.options.getString("type");
      const targetChannel = interaction.options.getChannel("target_channel");

      let currentMetricValue = "0";
      let defaultDesignName = "";

      if (type === "voice") {
        const voiceChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice);
        let voiceCount = 0;
        voiceChannels.forEach(ch => voiceCount += ch.members.size);
        currentMetricValue = voiceCount.toLocaleString();
        defaultDesignName = "🎙️ ┃ In Voices";
      } else if (type === "today") {
        const joinedTodayCount = await redis.get(`stats:joinedtoday:${guildId}`) || "0";
        currentMetricValue = parseInt(joinedTodayCount).toLocaleString();
        defaultDesignName = "📈 ┃ Joined Today";
      }

      let activeChannelId = null;
      let displayMessage = "";

      if (targetChannel) {
        activeChannelId = targetChannel.id;
        displayMessage = `✅ **Premium Data Sync Completed:** Connected to channel ${targetChannel}. It will now track advanced **${type.toUpperCase()}** metrics.`;
        
        const customName = targetChannel.name.split("•")[0] || `${defaultDesignName} `;
        await targetChannel.setName(`${customName}• ${currentMetricValue}`).catch(() => null);
      } else {
        const botDesignedName = `${defaultDesignName} • ${currentMetricValue}`;
        
        const newChannel = await interaction.guild.channels.create({
          name: botDesignedName,
          type: ChannelType.GuildVoice,
          permissionOverwrites: [
            {
              id: interaction.guild.roles.everyone.id,
              deny: [PermissionFlagsBits.Connect],
            },
          ],
        }).catch(() => null);

        if (!newChannel) {
          return interaction.editReply({ content: "❌ **Permissions Error:** Unsuccessful creating channel asset. Ensure my application roles have channel generation rights." });
        }

        activeChannelId = newChannel.id;
        displayMessage = `🛠️ **Premium Channel Deployed:** Successfully generated brand new voice asset <#${newChannel.id}> using premium design parameters. *(You can rename it inside Discord anytime, just keep the \`•\` symbol intact!)*`;
      }

      await redis.set(`stats:channel:${type}:${guildId}`, activeChannelId);
      return interaction.editReply({ content: displayMessage });
    }
  }
};

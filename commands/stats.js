const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("📊 Setup server performance statistics tracker channels.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("setup")
        .setDescription("Deploy live community tracking channels.")
        .addStringOption(opt =>
          opt.setName("type")
            .setDescription("Select tracking metric type.")
            .setRequired(true)
            .addChoices(
              { name: "👥 Total Members", value: "total" },
              { name: "🟢 Online Users", value: "online" }
            )
        )
        .addChannelOption(opt =>
          opt.setName("target_channel")
            .setDescription("Use existing voice channel (optional).")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false)
        )
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const guild = interaction.guild;
    const guildId = interaction.guildId;
    const type = interaction.options.getString("type");
    const targetChannel = interaction.options.getChannel("target_channel");

    let currentMetricValue = "0";
    let defaultDesignName = "";

    // MEMBER COUNT
    if (type === "total") {
      currentMetricValue = guild.memberCount.toLocaleString();
      defaultDesignName = "👥 ┃ Members";
    }

    // ONLINE COUNT (safe version)
    if (type === "online") {
      const onlineCount = guild.members.cache.filter(
        m => m.presence && m.presence.status && m.presence.status !== "offline"
      ).size;

      currentMetricValue = onlineCount.toLocaleString();
      defaultDesignName = "🟢 ┃ Online";
    }

    let activeChannelId = null;
    let responseText = "";

    // CASE 1: Use existing channel
    if (targetChannel) {
      activeChannelId = targetChannel.id;

      const baseName = targetChannel.name.split("•")[0] || defaultDesignName;

      await targetChannel.setName(
        `${baseName} • ${currentMetricValue}`
      ).catch(() => null);

      responseText = `✅ Connected to ${targetChannel}. Tracking **${type.toUpperCase()}** now.`;
    }

    // CASE 2: Auto create channel
    else {
      const channelName = `${defaultDesignName} • ${currentMetricValue}`;

      const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.Connect]
          }
        ]
      }).catch(() => null);

      if (!newChannel) {
        return interaction.editReply({
          content: "❌ Failed to create stats channel. Check bot permissions."
        });
      }

      activeChannelId = newChannel.id;
      responseText = `🛠️ Created stats channel <#${newChannel.id}> for **${type.toUpperCase()}** tracking.`;
    }

    await redis.set(`stats:channel:${type}:${guildId}`, activeChannelId);

    return interaction.editReply({ content: responseText });
  }
};

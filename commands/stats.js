const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("📊 Setup completely free server performance statistics tracker channels.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("setup")
        .setDescription("🛠️ Instantly deploy live community traction boards.")
        .addStringOption(opt =>
          opt.setName("type")
            .setDescription("Select the public tracking metric type.")
            .setRequired(true)
            .addChoices(
              { name: "👥 Total Members", value: "total" },
              { name: "🟢 Online Users", value: "online" }
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
    await interaction.deferReply();
    const guildId = interaction.guildId;
    const type = interaction.options.getString("type");
    const targetChannel = interaction.options.getChannel("target_channel");

    let currentMetricValue = "0";
    let defaultDesignName = "";

    if (type === "total") {
      currentMetricValue = interaction.guild.memberCount.toLocaleString();
      defaultDesignName = "👥 ┃ Members";
    } else if (type === "online") {
      const onlineCount = interaction.guild.members.cache.filter(m => m.presence && m.presence.status !== "offline").size;
      currentMetricValue = onlineCount.toLocaleString();
      defaultDesignName = "🟢 ┃ Online";
    }

    let activeChannelId = null;
    let displayMessage = "";

    // 🔄 CASE 1: User provided an existing directory channel
    if (targetChannel) {
      activeChannelId = targetChannel.id;
      displayMessage = `✅ **Free Data Sync Completed:** Connected to channel ${targetChannel}. It will now track public **${type.toUpperCase()}** metrics.`;
      
      const customName = targetChannel.name.split("•")[0] || `${defaultDesignName} `;
      await targetChannel.setName(`${customName}• ${currentMetricValue}`).catch(() => null);
    } 
    // 🛠️ CASE 2: Auto-Create using our clean default structural layout
    else {
      const botDesignedName = `${defaultDesignName} • ${currentMetricValue}`;
      
      const newChannel = await interaction.guild.channels.create({
        name: botDesignedName,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.Connect], // Locks channel sidebar visual flow
          },
        ],
      }).catch(() => null);

      if (!newChannel) {
        return interaction.editReply({ content: "❌ **Permissions Error:** Unsuccessful creating channel asset. Ensure my application roles have channel generation rights." });
      }

      activeChannelId = newChannel.id;
      displayMessage = `🛠️ **Public Counter Deployed:** Successfully generated brand new free voice asset <#${newChannel.id}>. *(You can edit its name inside Discord anytime, just keep the \`•\` symbol intact!)*`;
    }

    await redis.set(`stats:channel:${type}:${guildId}`, activeChannelId);
    return interaction.editReply({ content: displayMessage });
  }
};

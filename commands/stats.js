// commands/stats.js – Setup stats channels (voice & joined are premium)
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

module.exports = {
  category: "Server Management",
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Setup live statistics channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("setup")
        .setDescription("Deploy live tracking channels")
        .addStringOption(opt =>
          opt.setName("type")
            .setDescription("Select metric type")
            .setRequired(true)
            .addChoices(
              { name: "👥 Total Members", value: "total" },
              { name: "🟢 Online Users", value: "online" },
              { name: "🎙️ Voice Activity", value: "voice" },
              { name: "📅 Joined Today", value: "joined" }
            )
        )
        .addChannelOption(opt =>
          opt.setName("target_channel")
            .setDescription("Use existing voice channel (optional)")
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

    // ---- Check if guild has premium for voice & joined stats ----
    const isPremium = await redis.get(`premium:guild:${guildId}`) !== null;
    const premiumOnlyTypes = ["voice", "joined"];

    if (premiumOnlyTypes.includes(type) && !isPremium) {
      return interaction.editReply({
        content: "❌ **Voice Activity** and **Joined Today** stats are **Guild Premium** features. Upgrade to premium to unlock them."
      });
    }

    const defaultNames = {
      total: "👥 ┃ Members",
      online: "🟢 ┃ Online",
      voice: "🎙️ ┃ Voice",
      joined: "📅 ┃ Joined Today"
    };

    const getCount = () => {
      if (type === "total") return guild.memberCount;
      if (type === "online") {
        return guild.members.cache.filter(m => m.presence?.status !== "offline").size;
      }
      if (type === "voice") {
        return guild.members.cache.filter(m => m.voice.channel).size;
      }
      if (type === "joined") {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return guild.members.cache.filter(m => m.joinedAt && m.joinedAt >= today).size;
      }
      return 0;
    };

    const currentCount = getCount();
    const baseName = defaultNames[type];

    let channelId;

    if (targetChannel) {
      channelId = targetChannel.id;
      const nameParts = targetChannel.name.split("•");
      const base = nameParts[0]?.trim() || baseName;
      await targetChannel.setName(`${base} • ${currentCount}`).catch(() => null);
    } else {
      const newChannel = await guild.channels.create({
        name: `${baseName} • ${currentCount}`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }
        ]
      });
      channelId = newChannel.id;
    }

    await redis.set(`stats:channel:${type}:${guildId}`, channelId);
    await redis.set(`stats:baseName:${type}:${guildId}`, baseName);

    return interaction.editReply({
      content: `✅ Stats tracking enabled for **${type.toUpperCase()}** in <#${channelId}>.`
    });
  }
};

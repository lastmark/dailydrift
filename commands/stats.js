// commands/stats.js – Server Statistics Engine (MongoDB Optimized)
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

module.exports = {
  category: "Server Management",
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Deploy live server statistics channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("setup")
        .setDescription("Initialize a tracking node")
        .addStringOption(opt =>
          opt.setName("type")
            .setDescription("The metric to track")
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
            .setDescription("Existing channel to link (optional)")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false)
        )
    ),

  async execute(interaction, client, db) {
    await interaction.deferReply();

    const { guild } = interaction;
    const guildId = guild.id;
    const type = interaction.options.getString("type");
    const targetChannel = interaction.options.getChannel("target_channel");

    // --- Premium Guard ---
    const isPremium = (await db.get(`premium:guild:${guildId}`)) !== null;
    const premiumOnly = ["voice", "joined"];

    if (premiumOnly.includes(type) && !isPremium) {
      return interaction.editReply({
        content: "⭐ **Guild Premium Required:** Voice Activity and Joined Today statistics require an active premium subscription."
      });
    }

    const defaultNames = {
      total: "👥 ┃ Members",
      online: "🟢 ┃ Online",
      voice: "🎙️ ┃ Voice",
      joined: "📅 ┃ Joined Today"
    };

    // --- Logic for Metric Retrieval ---
    const getCount = () => {
      if (type === "total") return guild.memberCount;
      if (type === "online") return guild.members.cache.filter(m => m.presence?.status !== "offline").size;
      if (type === "voice") return guild.members.cache.filter(m => m.voice.channel).size;
      if (type === "joined") {
        const today = new Date().setHours(0, 0, 0, 0);
        return guild.members.cache.filter(m => m.joinedAt?.getTime() >= today).size;
      }
      return 0;
    };

    const currentCount = getCount();
    const baseName = defaultNames[type];

    let channelId;

    if (targetChannel) {
      channelId = targetChannel.id;
      await targetChannel.setName(`${baseName} • ${currentCount}`).catch(() => null);
    } else {
      const newChannel = await guild.channels.create({
        name: `${baseName} • ${currentCount}`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }]
      });
      channelId = newChannel.id;
    }

    // --- Persistence in MongoDB ---
    await db.set(`stats:channel:${type}:${guildId}`, channelId);
    await db.set(`stats:baseName:${type}:${guildId}`, baseName);

    return interaction.editReply({
      content: `✅ **Metric Active:** Tracking **${type.toUpperCase()}** at <#${channelId}>.`
    });
  }
};

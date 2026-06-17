const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  MessageFlags
} = require("discord.js");

module.exports = {
  category: "Premium",

  data: new SlashCommandBuilder()
    .setName("premium-set")
    .setDescription("💎 Premium system configuration panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
      sub.setName("antispam")
        .setDescription("⚡ Configure anti-spam event system")
        .addStringOption(opt =>
          opt.setName("status")
            .setDescription("Enable or disable system")
            .setRequired(true)
            .addChoices(
              { name: "Enabled", value: "true" },
              { name: "Disabled", value: "false" }
            )
        )
        .addStringOption(opt =>
          opt.setName("level")
            .setDescription("Detection sensitivity")
            .setRequired(false)
            .addChoices(
              { name: "Low (Safer)", value: "low" },
              { name: "Medium (Balanced)", value: "medium" },
              { name: "High (Strict)", value: "high" }
            )
        )
    )

    .addSubcommand(sub =>
      sub.setName("setup-stats")
        .setDescription("📊 Configure live server stats system")
        .addStringOption(opt =>
          opt.setName("type")
            .setDescription("Stat type")
            .setRequired(true)
            .addChoices(
              { name: "Voice Activity", value: "voice" },
              { name: "Members Joined Today", value: "today" }
            )
        )
        .addChannelOption(opt =>
          opt.setName("channel")
            .setDescription("Optional voice channel")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false)
        )
    ),

  async execute(interaction, client, redis) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    /* =========================
       PREMIUM CHECK
    ========================= */
    const premium = await redis.get(`premium:guild:${guildId}`);

    if (!premium || premium === "false") {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF3B6B")
            .setTitle("🔒 Premium Required")
            .setDescription("This server does not have an active premium license.")
        ],
        flags: [MessageFlags.Ephemeral]
      });
    }

    /* =========================
       ANTI-SPAM CONFIG (EVENT CONTROL)
    ========================= */
    if (sub === "antispam") {
      const status = interaction.options.getString("status");
      const level = interaction.options.getString("level") || "medium";

      await redis.set(`antispam:${guildId}:enabled`, status);
      await redis.set(`antispam:${guildId}:level`, level);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(status === "true" ? "#00FFAA" : "#FF4D4D")
            .setTitle("⚙️ Anti-Spam Configuration Updated")
            .addFields(
              {
                name: "Status",
                value: status === "true" ? "🟢 Enabled" : "🔴 Disabled",
                inline: true
              },
              {
                name: "Sensitivity",
                value: level.toUpperCase(),
                inline: true
              },
              {
                name: "Note",
                value: "This affects the event system in `/events/antiSpam.js`",
                inline: false
              }
            )
        ]
      });
    }

    /* =========================
       STATS SYSTEM
    ========================= */
    if (sub === "setup-stats") {
      await interaction.deferReply();

      const type = interaction.options.getString("type");
      const channel = interaction.options.getChannel("channel");

      let value = 0;
      let label = "";

      if (type === "voice") {
        value = interaction.guild.channels.cache
          .filter(c => c.type === ChannelType.GuildVoice)
          .reduce((a, c) => a + (c.members?.size || 0), 0);

        label = "🎙️ Voice Activity";
      }

      if (type === "today") {
        value = parseInt(await redis.get(`stats:joinedtoday:${guildId}`) || "0");
        label = "📈 Joined Today";
      }

      const name = `${label} • ${value}`;

      if (channel) {
        await channel.setName(name).catch(() => null);
        await redis.set(`stats:${type}:${guildId}`, channel.id);

        return interaction.editReply({
          content: `📊 Linked stats to ${channel}`
        });
      }

      const newChannel = await interaction.guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            deny: ["Connect"]
          }
        ]
      }).catch(() => null);

      if (!newChannel) {
        return interaction.editReply({
          content: "❌ Failed to create stats channel."
        });
      }

      await redis.set(`stats:${type}:${guildId}`, newChannel.id);

      return interaction.editReply({
        content: `📊 Created stats channel: <#${newChannel.id}>`
      });
    }
  }
};

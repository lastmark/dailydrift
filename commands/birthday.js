const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

const e = require("../emojis.js");

module.exports = {
  category: "Events",

  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Manage birthdays system")
    .addSubcommand(sub =>
      sub.setName("set")
        .setDescription("Save your birthday")
        .addIntegerOption(opt =>
          opt.setName("month").setDescription("Month (1-12)").setRequired(true).setMinValue(1).setMaxValue(12)
        )
        .addIntegerOption(opt =>
          opt.setName("day").setDescription("Day (1-31)").setRequired(true).setMinValue(1).setMaxValue(31)
        )
    )
    .addSubcommand(sub =>
      sub.setName("setup")
        .setDescription("Configure birthday channel")
        .addChannelOption(opt =>
          opt.setName("channel")
            .setDescription("Select channel")
            .addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption(opt =>
          opt.setName("auto_create")
            .setDescription("Auto create channel")
        )
    )
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("Show all saved birthdays in this server")
    )
    .addSubcommand(sub =>
      sub.setName("upcoming")
        .setDescription("Show next upcoming birthdays")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    /* =========================
       🎂 SET BIRTHDAY
    ========================= */
    if (sub === "set") {
      const month = interaction.options.getInteger("month");
      const day = interaction.options.getInteger("day");

      if (month === 2 && day > 29) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`${e.error || "❌"} February can't exceed 29 days`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      if ([4, 6, 9, 11].includes(month) && day > 30) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`${e.error || "❌"} This month has only 30 days`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const formatted = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const userId = interaction.user.id;

      // FIXED: consistent storage (no WRONGTYPE anymore)
      await redis.hset(`birthday:user:${guildId}`, userId, formatted);
      await redis.sadd(`birthday:date:${guildId}:${formatted}`, userId);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF69B4")
            .setAuthor({
              name: "Birthday Saved",
              iconURL: interaction.user.displayAvatarURL()
            })
            .setDescription(`${e.success || "🎉"} Saved successfully!\n📅 **Date:** \`${formatted}\``)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    /* =========================
       ⚙️ SETUP CHANNEL
    ========================= */
    if (sub === "setup") {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

      if (!isAdmin) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`${e.error || "❌"} Missing Manage Server permission`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const channel = interaction.options.getChannel("channel");
      const autoCreate = interaction.options.getBoolean("auto_create");

      if (!channel && !autoCreate) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`${e.error || "❌"} Select channel or enable auto-create`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      let target = channel;

      if (!target && autoCreate) {
        await interaction.deferReply();

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor("#ED4245")
                .setDescription(`${e.error || "❌"} I need Manage Channels permission`)
            ]
          });
        }

        target = await interaction.guild.channels.create({
          name: "🎂-birthdays",
          type: ChannelType.GuildText,
          topic: "Birthday celebration system"
        });

        await target.send({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF69B4")
              .setTitle("🎂 Birthday System Active")
              .setDescription("This channel will show birthday celebrations!")
          ]
        }).catch(() => null);
      }

      await redis.set(`birthday:channel:${guildId}`, target.id);

      return interaction.editReply
        ? interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor("#57F287")
                .setDescription(`${e.success || "✅"} Channel set to ${target}`)
            ]
          })
        : interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor("#57F287")
                .setDescription(`${e.success || "✅"} Channel set to ${target}`)
            ]
          });
    }

    /* =========================
       📜 LIST BIRTHDAYS
    ========================= */
    if (sub === "list") {
      const data = await redis.hgetall(`birthday:user:${guildId}`) || {};

      const list = Object.entries(data).map(([id, bday]) => {
        return `<@${id}> → **${bday}**`;
      });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle("🎂 Server Birthdays")
            .setDescription(list.length ? list.join("\n") : "No birthdays set yet.")
        ]
      });
    }

    /* =========================
       ⏳ UPCOMING BIRTHDAYS
    ========================= */
    if (sub === "upcoming") {
      const data = await redis.hgetall(`birthday:user:${guildId}`) || {};
      const now = new Date().getMonth() + 1;

      const upcoming = Object.entries(data)
        .map(([id, bday]) => ({ id, bday, month: parseInt(bday.split("-")[0]) }))
        .filter(x => x.month >= now)
        .sort((a, b) => a.month - b.month);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF69B4")
            .setTitle("🎉 Upcoming Birthdays")
            .setDescription(
              upcoming.length
                ? upcoming.map(u => `<@${u.id}> → **${u.bday}**`).join("\n")
                : "No upcoming birthdays found."
            )
        ]
      });
    }
  }
};

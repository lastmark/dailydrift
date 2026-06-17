const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder
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

    // =========================
    // 🎂 SET BIRTHDAY
    // =========================
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
          ephemeral: true
        });
      }

      if ([4, 6, 9, 11].includes(month) && day > 30) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`${e.error || "❌"} This month has only 30 days`)
          ],
          ephemeral: true
        });
      }

      const formatted = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      await redis.hset(`profile:${interaction.user.id}`, "birthday", formatted);
      await redis.sadd(`birthdays:date:${formatted}`, interaction.user.id);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF69B4")
            .setAuthor({
              name: "Birthday Saved",
              iconURL: interaction.user.displayAvatarURL()
            })
            .setDescription(
              `${e.success || "🎉"} Saved successfully!\n\n` +
              `📅 **Date:** \`${formatted}\``
            )
            .setTimestamp()
        ],
        ephemeral: true
      });
    }

    // =========================
    // ⚙️ SETUP CHANNEL
    // =========================
    if (sub === "setup") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`${e.error || "❌"} Missing Manage Server permission`)
          ],
          ephemeral: true
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
          ephemeral: true
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

        try {
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

        } catch (err) {
          console.error(err);
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor("#ED4245")
                .setDescription(`${e.error || "❌"} Failed to create channel`)
            ]
          });
        }
      }

      await redis.set(`birthday_channel:${interaction.guild.id}`, target.id);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setAuthor({
          name: "Birthday System Enabled",
          iconURL: interaction.guild.iconURL()
        })
        .setDescription(`${e.success || "✅"} Channel set to ${target}`)
        .setTimestamp();

      return interaction.deferred
        ? interaction.editReply({ embeds: [embed] })
        : interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 📜 LIST BIRTHDAYS
    // =========================
    if (sub === "list") {
      const keys = await redis.keys("profile:*");
      const list = [];

      for (const key of keys) {
        const id = key.split(":")[1];
        const data = await redis.hget(key, "birthday");
        if (data) list.push({ id, birthday: data });
      }

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("🎂 Server Birthdays")
        .setDescription(
          list.length
            ? list.map(u => `<@${u.id}> → **${u.birthday}**`).join("\n")
            : "No birthdays set yet."
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // ⏳ UPCOMING BIRTHDAYS
    // =========================
    if (sub === "upcoming") {
      const keys = await redis.keys("profile:*");
      const now = new Date();
      const current = now.getMonth() + 1;

      const upcoming = [];

      for (const key of keys) {
        const id = key.split(":")[1];
        const bday = await redis.hget(key, "birthday");
        if (!bday) continue;

        const [m] = bday.split("-").map(Number);

        if (m >= current) {
          upcoming.push({ id, birthday: bday });
        }
      }

      const embed = new EmbedBuilder()
        .setColor("#FF69B4")
        .setTitle("🎉 Upcoming Birthdays")
        .setDescription(
          upcoming.length
            ? upcoming.map(u => `<@${u.id}> → **${u.birthday}**`).join("\n")
            : "No upcoming birthdays found."
        );

      return interaction.reply({ embeds: [embed] });
    }
  }
};

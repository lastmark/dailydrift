const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder
} = require("discord.js");

module.exports = {
  category: "Server Management",
  data: new SlashCommandBuilder()
    .setName("log")
    .setDescription("Audit logging system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
      sub
        .setName("setup")
        .setDescription("Setup audit log channel")
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("Log channel (optional)")
            .addChannelTypes(ChannelType.GuildText)
        )
    ),

  async execute(interaction, client, redis) {
    const guild = interaction.guild;
    let channel = interaction.options.getChannel("channel");
    let created = false;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.editReply("❌ Missing Manage Channels permission");
    }

    if (!channel) {
      channel = await guild.channels.create({
        name: "audit-logs",
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: guild.members.me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks
            ]
          }
        ]
      });

      created = true;
    }

    await redis.set(`auditlog:${guild.id}`, channel.id);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("#57F287")
          .setTitle("🧾 Audit System Enabled")
          .setDescription("Logging system is now active")
          .addFields(
            { name: "Channel", value: `${channel}` },
            { name: "Mode", value: created ? "Auto Created" : "Manual" }
          )
      ]
    });
  }
};

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder
} = require("discord.js");

const e = require("../emojis.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("log")
    .setDescription("Full audit logging system setup")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("setup")
        .setDescription("Setup full audit logging system")
        .addChannelOption(opt =>
          opt.setName("channel")
            .setDescription("Select log channel (optional)")
            .addChannelTypes(ChannelType.GuildText)
        )
    ),

  async execute(interaction, client, redis) {
    const guild = interaction.guild;
    let channel = interaction.options.getChannel("channel");
    let created = false;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.editReply({
        content: "❌ Missing Manage Channels permission"
      });
    }

    // AUTO CREATE LOG CHANNEL
    if (!channel) {
      channel = await guild.channels.create({
        name: "🧾・audit-logs",
        type: ChannelType.GuildText,
        topic: "Full security audit logging system",
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
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

    const embed = new EmbedBuilder()
      .setColor("#57F287")
      .setTitle("🧾 Audit System Activated")
      .setDescription("Full server security logging system is now online.")
      .addFields(
        { name: "📡 Channel", value: `${channel}` },
        { name: "⚙️ Mode", value: created ? "Auto Created" : "Manual Bind" }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
};

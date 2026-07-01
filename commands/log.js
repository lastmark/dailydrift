// commands/log.js – Audit Logging Configuration System
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
    .setDescription("Configure or initialize the central audit logging pipeline")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub
        .setName("setup")
        .setDescription("Setup and bind an audit log channel sector")
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("Target channel for log streaming (leave blank for auto-creation)")
            .addChannelTypes(ChannelType.GuildText)
        )
    ),

  async execute(interaction, client, db) {
    const guild = interaction.guild;
    let channel = interaction.options.getChannel("channel");
    let created = false;

    // Defer processing interface cleanly using modular array layout
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // Validate structural permission capabilities of the client bot instance
    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      const errorEmbed = new EmbedBuilder()
        .setColor("#BA1A1A")
        .setDescription("❌ **System Fault:** Client application lacks the `ManageChannels` permission flag required to initialize automated logging sectors.");
      return interaction.editReply({ embeds: [errorEmbed] });
    }

    // Auto-create isolated log segment if no channel option argument was declared
    if (!channel) {
      channel = await guild.channels.create({
        name: "audit-logs",
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel] // Restrict standard visibility entirely from @everyone
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

    // Update global server profile bindings inside database mapping tracking
    await db.set(`auditlog:${guild.id}`, channel.id);

    const confirmationEmbed = new EmbedBuilder()
      .setColor("#0A0A0A") // Premium dark minimalist layout formatting
      .setTitle("🧾 Audit Logging Subsystem Synced")
      .setDescription("The security packet intercept pipeline is now monitoring guild events.")
      .addFields(
        { name: "📡 Stream Terminal", value: `${channel} | \`${channel.id}\``, inline: true },
        { name: "🎛️ Initialization Mode", value: created ? "`AUTOMATED SYSTEM SECTOR`" : "`MANUAL LINK SECTOR`", inline: true }
      )
      .setFooter({ text: "Security Pipeline Operational" })
      .setTimestamp();

    return interaction.editReply({ embeds: [confirmationEmbed] });
  }
};

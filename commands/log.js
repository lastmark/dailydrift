const { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType, 
  OverwriteType,
  MessageFlags 
} = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("log")
    .setDescription("⚙️ Configure security action logging streams.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("setup").setDescription("Bind an existing text channel or auto-create a secure log room.")
        .addChannelOption(opt => 
          opt.setName("channel")
            .setDescription("Target logs destination (Leave empty to let the bot auto-create a private room)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
    ),

  async execute(interaction, client, redis) {
    const guild = interaction.guild;
    let channel = interaction.options.getChannel("channel");
    let isAutoCreated = false;

    // Acknowledge interaction quickly to prevent gateway timeout during channel creation
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // ─── AUTO-CREATION LOGIC ───
    if (!channel) {
      try {
        channel = await guild.channels.create({
          name: "mod-logs",
          type: ChannelType.GuildText,
          topic: "🛡️ Automated system security logs feed.",
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel], // Private to the regular public
              type: OverwriteType.Role
            },
            {
              id: guild.members.me.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks], // Bot access strings
              type: OverwriteType.Member
            }
          ]
        });
        isAutoCreated = true;
      } catch (err) {
        return interaction.editReply({ 
          content: `${e.error || "❌"} **Automation Error:** Failed to auto-generate a private channel channel. Ensure the bot has \`Manage Channels\` authority.` 
        });
      }
    }

    // Save target room reference ID to Redis engine
    await redis.set(`modlog_channel:${guild.id}`, channel.id);

    const confirmationMessage = isAutoCreated
      ? `${e.check || "✅"} ${e.announcement || "⚙️"} **Audit Channel Generated:** Created private channel ${channel} and bound the security logging stream.`
      : `${e.check || "✅"} ${e.announcement || "⚙️"} **Audit System Active:** Mod actions are now routed directly to ${channel}.`;

    return interaction.editReply({ content: confirmationMessage });
  }
};

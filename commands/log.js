const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("log")
    .setDescription("⚙️ Configure security action logging streams.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("setup").setDescription("Bind an active text channel to collect mod audit feeds.")
        .addChannelOption(opt => opt.setName("channel").setDescription("Target logs destination").setRequired(true).addChannelTypes(ChannelType.GuildText))
    ),

  async execute(interaction, client, redis) {
    const channel = interaction.options.getChannel("channel");
    await redis.set(`modlog_channel:${interaction.guild.id}`, channel.id);
    return interaction.reply({ content: `${e.check || "✅"} ${e.announcement || "⚙️"} **Audit System Active:** Mod actions are now routed directly to ${channel}.` });
  }
};

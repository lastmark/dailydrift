// commands/rename-vip.js – rename the VIP Hub (admin only)
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Server Management",

  data: new SlashCommandBuilder()
    .setName("rename-vip")
    .setDescription("Rename the VIP Hub channel (admin only)")
    .addStringOption(opt =>
      opt.setName("name")
        .setDescription("New name for the VIP Hub (max 32 characters)")
        .setRequired(true)
        .setMaxLength(32)
    ),

  async execute(interaction, client, redis) {
    // Admin only
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ You need Administrator permission.",
        flags: MessageFlags.Ephemeral
      });
    }

    const guildId = interaction.guild.id;
    const hubId = await redis.get(`vip:${guildId}:hub`);

    if (!hubId) {
      return interaction.reply({
        content: "❌ No VIP hub has been set up. Use `/setup-vip` first.",
        flags: MessageFlags.Ephemeral
      });
    }

    const hub = interaction.guild.channels.cache.get(hubId);
    if (!hub) {
      // Hub deleted – clean up Redis
      await redis.del(`vip:${guildId}:hub`);
      return interaction.reply({
        content: "❌ The VIP hub no longer exists. Please re‑run `/setup-vip`.",
        flags: MessageFlags.Ephemeral
      });
    }

    const newName = interaction.options.getString("name");

    try {
      await hub.setName(newName, `Renamed by ${interaction.user.tag}`);
      return interaction.reply({
        content: `✅ VIP hub renamed to **${newName}**.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error("Hub rename error:", error);
      return interaction.reply({
        content: `❌ Failed to rename hub: ${error.message}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

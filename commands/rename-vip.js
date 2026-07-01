// commands/rename-vip.js – VIP Channel Identifier Update
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Server Management",

  data: new SlashCommandBuilder()
    .setName("rename-vip")
    .setDescription("Modify the display label of the primary VIP Hub sector")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(opt =>
      opt.setName("name")
        .setDescription("New alphanumeric label (max 32 chars)")
        .setRequired(true)
        .setMaxLength(32)
    ),

  async execute(interaction, client, db) {
    // Permission check handled by SlashCommandBuilder (defaultMemberPermissions), 
    // but retained for explicit audit logic if needed.
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ **Access Denied:** Administrator authorization required.",
        flags: MessageFlags.Ephemeral
      });
    }

    const guildId = interaction.guild.id;
    // Database retrieval of the hub channel ID
    const hubId = await db.get(`vip:${guildId}:hub`);

    if (!hubId) {
      return interaction.reply({
        content: "❌ **System Fault:** No VIP hub registry exists. Initialize a new hub using `/setup-vip`.",
        flags: MessageFlags.Ephemeral
      });
    }

    const hub = interaction.guild.channels.cache.get(hubId);
    if (!hub) {
      // Hub registry corrupted; purge stale entry
      await db.del(`vip:${guildId}:hub`);
      return interaction.reply({
        content: "❌ **Registry Mismatch:** The cached hub channel was not found. Please re-run the `/setup-vip` procedure.",
        flags: MessageFlags.Ephemeral
      });
    }

    const newName = interaction.options.getString("name");

    try {
      await hub.setName(newName, `Sector renamed by ${interaction.user.tag}`);
      
      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle("✅ Sector Re-labeled")
        .setDescription(`The VIP Hub has been successfully updated.`)
        .addFields(
          { name: "New Designation", value: `\`#${newName}\``, inline: true },
          { name: "Operator", value: `${interaction.user}`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error("VIP Hub Rename Pipeline Exception:", error);
      return interaction.reply({
        content: `❌ **Operation Failed:** Unable to patch channel designation. \`${error.message}\``,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

// commands/setup-vip.js – Automated VIP Infrastructure Deployment
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ChannelType, 
  PermissionFlagsBits, 
  MessageFlags 
} = require("discord.js");

module.exports = {
  category: "Server Management",

  data: new SlashCommandBuilder()
    .setName("setup-vip")
    .setDescription("Initialize or purge the primary VIP hub gateway")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addBooleanOption(opt =>
      opt.setName("clear")
        .setDescription("Terminate the existing VIP hub configuration")
    ),

  async execute(interaction, client, db) {
    const clear = interaction.options.getBoolean("clear") || false;
    const guildId = interaction.guild.id;
    const hubKey = `vip:${guildId}:hub`;

    // --- Clearance Protocol ---
    if (clear) {
      const hubId = await db.get(hubKey);
      if (hubId) {
        const hub = interaction.guild.channels.cache.get(hubId);
        if (hub) await hub.delete("VIP hub terminated by administrator").catch(() => {});
        await db.del(hubKey);
      }
      return interaction.reply({
        content: "✅ **Protocol Initiated:** VIP hub sector has been purged.",
        flags: MessageFlags.Ephemeral
      });
    }

    // --- Deployment Protocol ---
    let hubId = await db.get(hubKey);
    let hub = hubId ? interaction.guild.channels.cache.get(hubId) : null;

    if (hub) {
      return interaction.reply({
        content: `✅ **System Operational:** VIP hub already deployed at ${hub}`,
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          content: "❌ **Authorization Failure:** Bot requires `ManageChannels` permission to deploy hub infrastructure.",
          flags: MessageFlags.Ephemeral
        });
      }

      hub = await interaction.guild.channels.create({
        name: "🎙️ VIP Hub",
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
          }
        ]
      });

      await db.set(hubKey, hub.id);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium minimalist aesthetic
        .setTitle("✅ Infrastructure Deployment: SUCCESS")
        .setDescription(`**VIP Hub Gateway:** ${hub}`)
        .addFields(
          { name: "Logic Flow", value: "Users entering the gateway are dynamically routed to temporary private nodes.", inline: false },
          { name: "Node Capacity", value: "Standard: 3 | Premium: Unlimited", inline: true }
        )
        .setFooter({ text: "Use /rename-vip for custom designation." })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error("VIP Deployment Pipeline Exception:", error);
      return interaction.reply({
        content: `❌ **Deployment Failure:** \`${error.message}\``,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

// commands/setup-vip.js
const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Server Management",

  data: new SlashCommandBuilder()
    .setName("setup-vip")
    .setDescription("Set up the VIP hub channel (auto-creates it)")
    .addBooleanOption(opt =>
      opt.setName("clear")
        .setDescription("Clear the VIP hub setup")
    ),

  async execute(interaction, client, redis) {
    // Admin only
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ You need Administrator permission.",
        flags: MessageFlags.Ephemeral
      });
    }

    const clear = interaction.options.getBoolean("clear") || false;
    const guildId = interaction.guild.id;
    const hubKey = `vip:${guildId}:hub`;

    if (clear) {
      const hubId = await redis.get(hubKey);
      if (hubId) {
        const hub = interaction.guild.channels.cache.get(hubId);
        if (hub) await hub.delete("VIP hub cleared by admin").catch(() => {});
        await redis.del(hubKey);
        await redis.del(`vip:${guildId}:spawnChannel`); // old key, just in case
      }
      return interaction.reply({
        content: "✅ VIP hub has been cleared.",
        flags: MessageFlags.Ephemeral
      });
    }

    // Check if hub already exists
    let hubId = await redis.get(hubKey);
    let hub = hubId ? interaction.guild.channels.cache.get(hubId) : null;

    if (hub) {
      return interaction.reply({
        content: `✅ VIP hub is already set up: ${hub}`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Create hub channel
    try {
      const bot = interaction.guild.members.me;
      if (!bot.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          content: "❌ I need **Manage Channels** permission.",
          flags: MessageFlags.Ephemeral
        });
      }

      hub = await interaction.guild.channels.create({
        name: "🎙️ VIP Hub",
        type: ChannelType.GuildVoice,
        userLimit: 0,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
            deny: [PermissionFlagsBits.ManageChannels]
          }
        ]
      });

      await redis.set(hubKey, hub.id);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ VIP Hub Created")
        .setDescription(`${hub}`)
        .addFields(
          { name: "How it works", value: "Users who join this hub will get a temporary 2‑person VIP channel.", inline: false },
          { name: "Standard Server Limit", value: "3 channels per user", inline: true },
          { name: "Premium Server Limit", value: "Unlimited", inline: true }
        )
        .setFooter({ text: "Use /rename-vip to change your VIP channel's name." })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error("VIP setup error:", error);
      return interaction.reply({
        content: `❌ Failed to create hub: ${error.message}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

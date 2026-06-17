const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const e = require("../emojis");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("configs")
    .setDescription("Display the currently configured welcome and leave channels."),

  async execute(interaction, client, redis) {
    const guildId = interaction.guild.id;

    // 1. Fetch both channel IDs simultaneously from Redis
    const [welcomeId, leaveId] = await Promise.all([
      redis.get(`welcome:${guildId}`),
      redis.get(`leave:${guildId}`)
    ]);

    // 2. Resolve the channel names or display a neat "Not Set" flag
    const welcomeChannel = welcomeId ? `<#${welcomeId}>` : "*Not configured*";
    const leaveChannel = leaveId ? `<#${leaveId}>` : "*Not configured*";

    // 3. Build a clean, minimalist status dashboard
    const systemsEmbed = new EmbedBuilder()
      .setColor(0x2B2D31) // Sleek dark aesthetic color
      .setAuthor({ 
        name: `${interaction.guild.name} • System Configuration`, 
        iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
      })
      .addFields(
        { 
          name: `${e.join || "📥"} Welcome System`, 
          value: `└ Destination: ${welcomeChannel}`, 
          inline: true 
        },
        { 
          name: `${e.leav || "📤"} Leave System`, 
          value: `└ Destination: ${leaveChannel}`, 
          inline: true 
        }
      )
      .setFooter({ 
        text: "Server configuration status dashboard",
        iconURL: client.user.displayAvatarURL()
      });

    return interaction.reply({ embeds: [systemsEmbed] });
  }
};

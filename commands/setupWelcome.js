const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Configure or update the welcome channel for this server.")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("The channel where welcome messages should be sent")
        .addChannelTypes(ChannelType.GuildText) // Restricts selection to text channels
        .setRequired(true)
    ),

  async execute(interaction, client, redis) {
    // 1. Get the channel selected by the user
    const targetChannel = interaction.options.getChannel("channel");
    const guildId = interaction.guild.id;

    // 2. Save the new channel ID to Redis
    await redis.set(`welcome:${guildId}`, targetChannel.id);

    // 3. Create a luxurious, clean success embed
    const successEmbed = new EmbedBuilder()
      .setColor(0x00FF7F) // Spring Green accent
      .setTitle("⚙️ Configuration Updated")
      .setDescription("The welcome system has been successfully updated.")
      .addFields(
        { 
          name: "📍 System", 
          value: "└ Welcome Messages", 
          inline: true 
        },
        { 
          name: "💬 Target Channel", 
          value: `└ ${targetChannel}`, 
          inline: true 
        }
      )
      .setTimestamp()
      .setFooter({ 
        text: `Configured by ${interaction.user.username}`, 
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
      });

    // 4. Reply with the embed
    await interaction.reply({ embeds: [successEmbed] });
  }
};

const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setcounting")
    .setDescription("Configure the channel designated for the counting game.")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("The channel where players will count")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction, client, redis) {
    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
    const guildId = interaction.guild.id;

    // Save the counting channel ID to Redis
    await redis.set(`counting_channel:${guildId}`, targetChannel.id);
    
    // Initialize or reset the count to 0 for a clean start
    await redis.set(`count:${guildId}`, 0);
    await redis.del(`count:${guildId}:user`);

    const successEmbed = new EmbedBuilder()
      .setColor(0x00FFFF) // Cyan accent
      .setTitle("🔢 Counting Game Initialized")
      .setDescription(`The counting channel has been successfully linked. Start from **1**!`)
      .addFields(
        { name: "📍 Channel", value: `└ ${targetChannel}`, inline: true },
        { name: "📈 Current Count", value: "└ 0", inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [successEmbed] });
  }
};

const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("📈 Render deep structural information and growth data matrices.")
    .addSubcommand(sub => sub.setName("server").setDescription("View live analytical infrastructure overview.")),

  async execute(interaction) {
    const { guild } = interaction;
    await guild.members.fetch(); // Pre-cache everything inside memory for real-time calculation accuracy

    const totalMembers = guild.memberCount;
    const humanCount = guild.members.cache.filter(m => !m.user.bot).size;
    const botCount = guild.members.cache.filter(m => m.user.bot).size;

    const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const categoryCount = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;

    const statsEmbed = new EmbedBuilder()
      .setColor("#111111")
      .setTitle(`📊 Core Data Metrics: ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .addFields(
        { 
          name: "👥 Demographics Cluster", 
          value: `• **Total Registry:** \`${totalMembers}\` profiles\n• **Humans:** \`${humanCount}\` users\n• **Automations:** \`${botCount}\` bots`, 
          inline: true 
        },
        { 
          name: "🗂️ Channel Node Footprint", 
          value: `• **Text Streams:** \`${textChannels}\` feeds\n• **Voice Clusters:** \`${voiceChannels}\` links\n• **Categories:** \`${categoryCount}\` units`, 
          inline: true 
        },
        { 
          name: "🛡️ Security Authentication Attributes", 
          value: `• **Verification Threshold Level:** \`Tier ${guild.verificationLevel}\` \n• **Premium Boost Count:** \`${guild.premiumSubscriptionCount || 0}\` tier boosts`, 
          inline: false 
        }
      )
      .setTimestamp()
      .setFooter({ text: "Global System Integrity Status: Safe" });

    return await interaction.reply({ embeds: [statsEmbed] });
  }
};

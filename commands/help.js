const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View all bot commands and features"),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    const [userPremium, guildPremium] = await Promise.all([
      redis.get(`premium:user:${userId}`),
      redis.get(`premium:guild:${guildId}`)
    ]);

    const userStatus = userPremium ? "Active" : "Standard";
    const guildStatus = guildPremium ? "Active" : "Standard";

    const color = userPremium || guildPremium ? "#FFD700" : "#5865F2";

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({
        name: `${client.user.username} Help Center`,
        iconURL: client.user.displayAvatarURL()
      })
      .setDescription(
        `${e.info} Welcome ${interaction.user.username}\n\n` +
        `**Status Overview**\n` +
        `${e.premium} User: ${userStatus}\n` +
        `${e.server} Server: ${guildStatus}\n\n` +
        `Use the categories below to explore commands.`
      )
      .addFields(
        {
          name: `${e.profile} Profile System`,
          value:
            "`/profile view` - View profile\n" +
            "`/profile setbio` - Set biography\n" +
            "`/profile reset` - Reset profile"
        },
        {
          name: `${e.premium} Premium Features`,
          value:
            "`/profile upload` - Custom background\n" +
            "`/premium` - Check subscription status"
        },
        {
          name: `${e.tools} Utility`,
          value:
            "`/help` - Show this menu\n" +
            "`/ping` - Check bot latency"
        },
        {
          name: `${e.settings} Server Tools`,
          value:
            "`/premium-set antispam` - Anti-spam system\n" +
            "`/premium-set setup-stats` - Voice stats setup\n" +
            "`/responder-set` - Auto responder system"
        }
      )
      .setFooter({
        text: `${client.user.username} • System Help Module`
      })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};

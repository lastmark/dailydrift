const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const redis = require("../utils/redis");
const config = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Configure welcome message")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName("channel").setDescription("Set welcome channel").addChannelOption(opt => opt.setName("channel").setRequired(true)))
    .addSubcommand(sub => sub.setName("message").setDescription("Set welcome text (use {user} and {server})").addStringOption(opt => opt.setName("text").setRequired(true)))
    .addSubcommand(sub => sub.setName("image").setDescription("Set background image URL").addStringOption(opt => opt.setName("url").setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (sub === "channel") {
      const ch = interaction.options.getChannel("channel");
      await redis.set(`guild:${guildId}:welcomeChannel`, ch.id);
      await interaction.reply({ content: `${config.ICONS.setting} ✅ Welcome channel set to ${ch}`, ephemeral: true });
    } else if (sub === "message") {
      const text = interaction.options.getString("text");
      await redis.set(`guild:${guildId}:welcomeMsg`, text);
      await interaction.reply({ content: `${config.ICONS.message} ✅ Welcome message saved.`, ephemeral: true });
    } else if (sub === "image") {
      const url = interaction.options.getString("url");
      await redis.set(`guild:${guildId}:welcomeImage`, url);
      await interaction.reply({ content: `${config.ICONS.search} ✅ Welcome background set.`, ephemeral: true });
    }
  }
};

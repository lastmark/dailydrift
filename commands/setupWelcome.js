// commands/setwelcome.js – Premium Welcome Configuration Panel
const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags, PermissionFlagsBits } = require("discord.js");

module.exports = {
  category: "Server Management",
  data: new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("⚙️ Configure or customize the greeting welcome grid setup")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("channel")
        .setDescription("Set the text channel destination for member welcome logs")
        .addChannelOption(opt => opt.setName("target").setDescription("The destination text channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("text")
        .setDescription("📝 [FREE] Customize the welcome text caption format")
        .addStringOption(opt => opt.setName("message").setDescription("Use {user}, {server}, or {count} variables").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("background")
        .setDescription("🎨 [GUILD PREMIUM] Upload a custom background canvas link")
        .addStringOption(opt => opt.setName("url").setDescription("Direct high-res image URL link (PNG/JPG)").setRequired(true))
    ),

  async execute(interaction, client, redis) {
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();
    const isGuildPremium = await redis.get(`premium:guild:${guildId}`) !== null;

    if (sub === "channel") {
      const targetChannel = interaction.options.getChannel("target");
      await redis.set(`welcome:${guildId}`, targetChannel.id);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle("⚙️ WELCOME CONFIGURATION INITIALIZED")
        .setDescription(`• **Module:** \`Welcome Canvas Node\`\n• **Routing Target:** ${targetChannel}`);

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "text") {
      const msgFormat = interaction.options.getString("message");
      await redis.set(`welcome:text:${guildId}`, msgFormat);

      const embed = new EmbedBuilder()
        .setColor("#111111")
        .setTitle("📝 GREETING TEXT APPLIED")
        .setDescription(`\`\`\`${msgFormat}\`\`\``);

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "background") {
      if (!isGuildPremium) {
        return interaction.reply({
          content: "⭐ **Guild Premium Sub-module Locked:** Custom welcome background cards require Guild Premium status.",
          flags: MessageFlags.Ephemeral
        });
      }

      const url = interaction.options.getString("url");
      await redis.set(`welcome:bg:${guildId}`, url);

      const embed = new EmbedBuilder()
        .setColor("#1A1A1A")
        .setTitle("🎨 PREMIUM WELCOME CANVAS LINKED")
        .setDescription(`Custom canvas background updated.\n\n🖼️ **Asset:** [View Link](${url})`)
        .setThumbnail(url);

      return interaction.reply({ embeds: [embed] });
    }
  }
};

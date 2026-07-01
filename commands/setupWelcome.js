// commands/setwelcome.js – Corrected channel key
const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags, PermissionFlagsBits } = require("discord.js");

module.exports = {
  category: "Server Management",
  data: new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Configure or customize the greeting welcome grid setup")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("channel")
        .setDescription("Set the text channel destination for member welcome logs")
        .addChannelOption(opt => opt.setName("target").setDescription("The destination text channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("text")
        .setDescription("Customize the welcome text caption format")
        .addStringOption(opt => opt.setName("message").setDescription("Use {user}, {server}, or {count} variables").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("background")
        .setDescription("[GUILD PREMIUM] Upload a custom background canvas link")
        .addStringOption(opt => opt.setName("url").setDescription("Direct high-res image URL link (PNG/JPG)").setRequired(true))
    ),

  async execute(interaction, client, db) {
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();
    
    // Check Guild Premium Tier in MongoDB
    const isGuildPremium = (await db.get(`premium:guild:${guildId}`)) !== null;

    // ─── SUBCOMMAND: CHANNEL ───
    if (sub === "channel") {
      const targetChannel = interaction.options.getChannel("target");
      // ✅ Fixed key – matches index.js: db.get(`welcome:${guildId}`)
      await db.set(`welcome:${guildId}`, targetChannel.id);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle("⚙️ Welcome Channel Set")
        .setDescription(`**Target Channel:** ${targetChannel}\n\nMember join cards will now be sent here.`);
      return interaction.reply({ embeds: [embed] });
    }

    // ─── SUBCOMMAND: TEXT ───
    if (sub === "text") {
      const msgFormat = interaction.options.getString("message");
      await db.set(`welcome:text:${guildId}`, msgFormat);

      const embed = new EmbedBuilder()
        .setColor("#111111")
        .setTitle("📝 Welcome Message Updated")
        .setDescription(`**Preview:**\n\`\`\`${msgFormat}\`\`\`\n\nVariables {user}, {server}, {count} will be replaced automatically.`);
      return interaction.reply({ embeds: [embed] });
    }

    // ─── SUBCOMMAND: BACKGROUND (PREMIUM) ───
    if (sub === "background") {
      if (!isGuildPremium) {
        return interaction.reply({
          content: "⭐ **Guild Premium Sub-module Locked:** Custom welcome background cards require Guild Premium status.",
          flags: MessageFlags.Ephemeral
        });
      }

      const url = interaction.options.getString("url");
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return interaction.reply({ content: "❌ Invalid URL – please provide a direct image link.", flags: MessageFlags.Ephemeral });
      }

      await db.set(`welcome:bg:${guildId}`, url);

      const embed = new EmbedBuilder()
        .setColor("#1A1A1A")
        .setTitle("🎨 Premium Welcome Background Set")
        .setDescription(`Custom canvas background updated.\n\n🖼️ **Asset:** [View Link](${url})`)
        .setThumbnail(url);
      return interaction.reply({ embeds: [embed] });
    }
  }
};

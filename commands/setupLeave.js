// commands/setleave.js – Premium Leave Configuration Panel (MongoDB Optimized)
const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags, PermissionFlagsBits } = require("discord.js");

module.exports = {
  category: "Server Management",
  data: new SlashCommandBuilder()
    .setName("setleave")
    .setDescription("Configure or customize the departure grid setup")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("channel")
        .setDescription("Set the text channel destination for member leave logs")
        .addChannelOption(opt => opt.setName("target").setDescription("The destination text channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("text")
        .setDescription("Customize the departure text caption format")
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
    const guildPremiumData = await db.get(`premium:guild:${guildId}`);
    const isGuildPremium = guildPremiumData !== null;

    // ─── SUBCOMMAND: CHANNEL ───
    if (sub === "channel") {
      const targetChannel = interaction.options.getChannel("target");
      // Persist channel ID in MongoDB
      await db.set(`leave:channel:${guildId}`, targetChannel.id);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle("⚙️ CONFIGURATION SYSTEM RECONFIGURED")
        .setDescription(
          `**SYSTEM DEPLOYMENT SUCCESSFUL**\n` +
          `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
          `• **Operational Module:** \`Leave Canvas Node\`\n` +
          `• **Routing Target:** ${targetChannel}\n\n` +
          `*All member departures will now register down this pipeline vector.*`
        );

      return interaction.reply({ embeds: [embed] });
    }

    // ─── SUBCOMMAND: TEXT ───
    if (sub === "text") {
      const msgFormat = interaction.options.getString("message");
      await db.set(`leave:text:${guildId}`, msgFormat);

      const embed = new EmbedBuilder()
        .setColor("#111111")
        .setTitle("📝 DEPARTURE CAPTION STRING APPLIED")
        .setDescription(
          `**VARIABLE TEXT PARSER RECORDED**\n` +
          `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
          `\`\`\`${msgFormat}\`\`\`\n` +
          `*Variables like \`{user}\`, \`{server}\`, and \`{count}\` will automatically render natively.*`
        );

      return interaction.reply({ embeds: [embed] });
    }

    // ─── SUBCOMMAND: BACKGROUND (PREMIUM) ───
    if (sub === "background") {
      if (!isGuildPremium) {
        return interaction.reply({
          content: "⭐ **Guild Premium Sub-module Locked:** Overriding the default canvas asset layer requires an active Guild Premium tier subscription.",
          flags: MessageFlags.Ephemeral
        });
      }

      const url = interaction.options.getString("url");
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return interaction.reply({ content: "❌ **Invalid URI Vector:** Provide a clean, direct web layout link protocol.", flags: MessageFlags.Ephemeral });
      }

      await db.set(`leave:bg:${guildId}`, url);

      const embed = new EmbedBuilder()
        .setColor("#1A1A1A")
        .setTitle("🎨 PREMIUM CANVAS BACKGROUND LINKED")
        .setDescription(
          `**CUSTOM ASSET RENDER OVERRIDE INITIALIZED**\n` +
          `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
          `The engine has logged your external layout overlay link and will pass it into the dynamic canvas compiler process.\n\n` +
          `🖼️ **Asset Target Vector:** [View Configuration Link](${url})`
        )
        .setThumbnail(url);

      return interaction.reply({ embeds: [embed] });
    }
  }
};

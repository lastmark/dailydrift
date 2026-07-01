// commands/setleave.js – Fixed key alignment with leave event handler
const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags, PermissionFlagsBits } = require("discord.js");

module.exports = {
  category: "Server Management",
  data: new SlashCommandBuilder()
    .setName("setleave")
    .setDescription("Configure the member departure card system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("channel")
        .setDescription("Set the channel for leave messages")
        .addChannelOption(opt => opt.setName("target").setDescription("The destination text channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("text")
        .setDescription("Customise the leave message text")
        .addStringOption(opt => opt.setName("message").setDescription("Use {user}, {server}, or {count} variables").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("background")
        .setDescription("[GUILD PREMIUM] Upload a custom background image URL")
        .addStringOption(opt => opt.setName("url").setDescription("Direct image URL (PNG/JPG)").setRequired(true))
    ),

  async execute(interaction, client, db) {
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    // Premium check (only needed for background)
    const guildPremiumData = await db.get(`premium:guild:${guildId}`);
    const isGuildPremium = guildPremiumData !== null;

    // ── CHANNEL ──
    if (sub === "channel") {
      const targetChannel = interaction.options.getChannel("target");
      // ✅ Fixed key – matches index.js: db.get(`leave:${guildId}`)
      await db.set(`leave:${guildId}`, targetChannel.id);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle("⚙️ Leave Channel Configured")
        .setDescription(`**Target Channel:** ${targetChannel}\n\nMember departure cards will now be sent to this channel.`);
      return interaction.reply({ embeds: [embed] });
    }

    // ── TEXT ──
    if (sub === "text") {
      const msgFormat = interaction.options.getString("message");
      // ✅ Matches index.js: db.get(`leave:text:${guildId}`)
      await db.set(`leave:text:${guildId}`, msgFormat);

      const embed = new EmbedBuilder()
        .setColor("#111111")
        .setTitle("📝 Leave Message Updated")
        .setDescription(`**Preview:**\n\`\`\`${msgFormat}\`\`\`\n\nVariables {user}, {server}, {count} will be replaced automatically.`);
      return interaction.reply({ embeds: [embed] });
    }

    // ── BACKGROUND (PREMIUM) ──
    if (sub === "background") {
      if (!isGuildPremium) {
        return interaction.reply({
          content: "⭐ **Guild Premium Required** – custom backgrounds are only available for premium servers.",
          flags: MessageFlags.Ephemeral
        });
      }

      const url = interaction.options.getString("url");
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return interaction.reply({ content: "❌ Invalid URL – please provide a direct image link.", flags: MessageFlags.Ephemeral });
      }

      // ✅ Matches what leaveCard() expects: db.get(`leave:bg:${guildId}`)
      await db.set(`leave:bg:${guildId}`, url);

      const embed = new EmbedBuilder()
        .setColor("#1A1A1A")
        .setTitle("🎨 Premium Background Set")
        .setDescription(`The custom leave card background has been saved.\n🖼️ [View Image](${url})`)
        .setThumbnail(url);
      return interaction.reply({ embeds: [embed] });
    }
  }
};

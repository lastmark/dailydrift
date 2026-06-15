const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("👤 Design and display customized aesthetic user profile cards.")
    .addSubcommand(sub =>
      sub.setName("view")
        .setDescription("Render a stylized user data profile card.")
        .addUserOption(opt => opt.setName("target").setDescription("Select a user to inspect").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("setbio")
        .setDescription("Modify your personal database biography.")
        .addStringOption(opt => opt.setName("text").setDescription("Your new bio text (Max 150 chars)").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("setcolor")
        .setDescription("Customize your card's embed color using a hex code.")
        .addStringOption(opt => opt.setName("hex").setDescription("Example: #FF0000 or #000000").setRequired(true))
    ),

  async execute(interaction, client, redis) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    
    // 🔒 HARD-CODED DEVELOPER IDENTITY
    const DEVELOPER_ID = "YOUR_DISCORD_USER_ID"; // <--- Put your exact Discord ID string here!

    // ─── SUBCOMMAND: SET BIO ───
    if (subcommand === "setbio") {
      const bioText = interaction.options.getString("text");
      if (bioText.length > 150) {
        return await interaction.reply({ content: "❌ **Error:** Your biography text must be 150 characters or less.", ephemeral: true });
      }

      await redis.hset(`profile:${userId}`, "bio", bioText);
      return await interaction.reply({ content: "✅ **Success:** Your custom biography has been saved to the mainframe memory.", ephemeral: true });
    }

    // ─── SUBCOMMAND: SET COLOR ───
    if (subcommand === "setcolor") {
      let hex = interaction.options.getString("hex").toUpperCase().replace("#", "");
      const hexRegex = /^[0-9A-F]{6}$/i;

      if (!hexRegex.test(hex)) {
        return await interaction.reply({ content: "❌ **Invalid Format:** Please provide a valid 6-character hex color code (e.g., `#000000` or `#5865F2`).", ephemeral: true });
      }

      await redis.hset(`profile:${userId}`, "color", `#${hex}`);
      return await interaction.reply({ content: `✅ **Success:** Your profile accent highlight has been set to \`#${hex}\`.`, ephemeral: true });
    }

    // ─── SUBCOMMAND: VIEW PROFILE ───
    if (subcommand === "view") {
      const targetUser = interaction.options.getUser("target") || interaction.user;
      
      // Pull saved data fields from the Redis user hash matrix
      const profileData = await redis.hgetall(`profile:${targetUser.id}`) || {};
      const bio = profileData.bio || "No biography recorded yet. Use \`/profile setbio\` to create one.";
      
      // Determine the embed accent color
      let embedColor = profileData.color || "#111111"; // Fallback to sleek dark black
      let titleName = `👤 Profile Ledger: ${targetUser.username}`;

      // 👑 DEVELOPER AUTOMATED INJECTION HOOK
      if (targetUser.id === DEVELOPER_ID) {
        // Overwrite title with custom Dev Badge assets
        titleName = `👑 [CORE DEVELOPER] Profile Ledger: ${targetUser.username}`;
        // Force an exclusive, bright cyan neon color for the developer card frame
        embedColor = "#00FFFF"; 
      }

      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      const joinedTimestamp = member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "Unknown";
      const createdTimestamp = `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`;

      const profileEmbed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(titleName)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
        .setDescription(`*"${bio}"*`)
        .addFields(
          { name: "⏳ Account Created", value: createdTimestamp, inline: true },
          { name: "🚪 Joined Server", value: joinedTimestamp, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Requested by ${interaction.user.username}` });

      // Add an explicit System Authority badge field if it's you
      if (targetUser.id === DEVELOPER_ID) {
        profileEmbed.addFields({ 
          name: "⚡ System clearance Status", 
          value: "🟢 **Root Network Administrator (All Access Verified)**", 
          inline: false 
        });
      }

      return await interaction.reply({ embeds: [profileEmbed] });
    }
  }
};

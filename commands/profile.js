const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

try {
  const fontPath = path.join(__dirname, "../font.ttf");
  GlobalFonts.registerFromPath(fontPath, "CustomFont");
} catch (err) {
  console.log("⚠️ Font file registration offline:", err.message);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("👤 Design and display customized aesthetic user profile cards.")
    .addSubcommand(sub =>
      sub.setName("view")
        .setDescription("Render your graphical profile card layer.")
        .addUserOption(opt => opt.setName("target").setDescription("Select a user to inspect").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("setbio")
        .setDescription("Modify your personal database biography.")
        .addStringOption(opt => opt.setName("text").setDescription("Your new bio text (Max 80 chars)").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("upload")
        .setDescription("🖼️ Upload a custom 800x300 background image attachment.")
        .addAttachmentOption(opt => opt.setName("image").setDescription("Your custom background profile image").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("reset")
        .setDescription("🔄 Clear your custom background image.")
    ),

  async execute(interaction, client, redis) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const DEVELOPER_ID = "1303357369622990889"; 

    if (subcommand === "setbio") {
      const bioText = interaction.options.getString("text");
      if (bioText.length > 80) return await interaction.reply({ content: "❌ Bio text must be 80 characters or less.", ephemeral: true });
      await redis.hset(`profile:${userId}`, "bio", bioText);
      return await interaction.reply({ content: "✅ Biography updated.", ephemeral: true });
    }

    if (subcommand === "upload") {
      const PREMIUM_ROLE_ID = "YOUR_PREMIUM_ROLE_ID_HERE"; 
      const hasPremium = interaction.member.roles.cache.has(PREMIUM_ROLE_ID);

      if (interaction.user.id !== DEVELOPER_ID && !hasPremium) {
        return await interaction.reply({ content: "❌ This feature is locked to Core Developers and Premium Subscribers.", ephemeral: true });
      }

      const attachment = interaction.options.getAttachment("image");
      if (!attachment.contentType || !attachment.contentType.startsWith("image/")) {
        return await interaction.reply({ content: "❌ File must be an image (PNG/JPG).", ephemeral: true });
      }

      await redis.hset(`profile:${userId}`, "custom_bg", attachment.url);
      return await interaction.reply({ content: "✅ Background uploaded successfully.", ephemeral: true });
    }

    if (subcommand === "reset") {
      await redis.hdel(`profile:${userId}`, "custom_bg");
      return await interaction.reply({ content: "🔄 Custom background removed.", ephemeral: true });
    }

    if (subcommand === "view") {
      await interaction.deferReply();
      const targetUser = interaction.options.getUser("target") || interaction.user;
      const isDev = targetUser.id === DEVELOPER_ID;

      // Fetch Profile Data Matrix
      const profileData = await redis.hgetall(`profile:${targetUser.id}`) || {};
      const bio = profileData.bio || "No biography recorded yet. Use /profile setbio";
      const customBgUrl = profileData.custom_bg;
      const equippedBg = profileData.equipped || "classic";
      
      // Fetch Leveling Data Fields
      const level = parseInt(profileData.level) || 1;
      const currentXp = parseInt(profileData.xp) || 0;
      const xpNeeded = Math.floor(100 * Math.pow(level, 1.8));

      // Canvas Initialization Setup
      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      // Draw Background Canvas Layer
      try {
        let backgroundImage;
        if (customBgUrl) {
          backgroundImage = await loadImage(customBgUrl);
        } else {
          backgroundImage = await loadImage(path.join(__dirname, `../backgrounds/${equippedBg}.png`));
        }
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        ctx.fillStyle = "#111111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Darkness Vignette Mask Filter
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Card Accents
      const themeColor = isDev ? "#00FFFF" : "#5865F2";
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);

      // Render Avatar Circle Cutout
      const avatarURL = targetUser.displayAvatarURL({ extension: "png", size: 256 });
      const avatarImg = await loadImage(avatarURL);
      ctx.save();
      ctx.beginPath();
      ctx.arc(110, 130, 75, 0, Math.PI * 2, true);
      ctx.clip();
      ctx.drawImage(avatarImg, 35, 55, 150, 150);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(110, 130, 76, 0, Math.PI * 2, true);
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Typography Configuration
      ctx.fillStyle = "#ffffff";
      ctx.font = "32px CustomFont";
      
      // Draw Identity Layout Strings
      if (isDev) {
        ctx.fillStyle = "#00FFFF";
        ctx.fillText("👑 [DEV]", 220, 95);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(targetUser.username, 375, 95);
      } else {
        ctx.fillText(targetUser.username, 220, 95);
      }

      // Draw Level Counter text Right-Aligned
      ctx.font = "bold 28px CustomFont";
      ctx.fillStyle = themeColor;
      const levelText = `LVL ${level}`;
      ctx.fillText(levelText, 760 - ctx.measureText(levelText).width, 95);

      // Draw User Biography line
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.font = "20px CustomFont";
      ctx.fillText(bio, 220, 145);

      // DRAW DYNAMIC PROGRESSION EXPERIENCE LOADING BAR
      const barX = 220;
      const barY = 205;
      const barWidth = 540;
      const barHeight = 22;
      const radius = 11;

      // Calculate fill width safely based on current progress percentage
      const percentage = Math.min(currentXp / xpNeeded, 1);
      const progressWidth = barWidth * percentage;

      // Background Empty Track Container Tube
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth, barHeight, radius);
      ctx.fill();

      // Active Experience Fill Tube
      if (progressWidth > 0) {
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.roundRect(barX, barY, progressWidth, barHeight, radius);
        ctx.fill();
      }

      // Experience Numerical Strings Overlay Subtext
      ctx.fillStyle = "#ffffff";
      ctx.font = "14px CustomFont";
      const xpString = `${currentXp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`;
      ctx.fillText(xpString, barX + 15, barY + 16);

      // System Access Role Footer String
      ctx.fillStyle = isDev ? "#00FFFF" : "rgba(255, 255, 255, 0.35)";
      ctx.font = "13px CustomFont";
      const footText = isDev ? "SYSTEM ACCESS: ROOT NET ADMIN" : `NETWORK USER ID: ${targetUser.id}`;
      ctx.fillText(footText, 220, 260);

      const buffer = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(buffer, { name: `profile-${targetUser.id}.png` });
      return await interaction.editReply({ files: [attachment] });
    }
  }
};

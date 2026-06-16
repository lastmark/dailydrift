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
        .setDescription("🖼️ Upload a custom 800x300 background image attachment (Premium Only).")
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

    // ==========================================
    // 📝 SUBCOMMAND: SET BIO
    // ==========================================
    if (subcommand === "setbio") {
      const bioText = interaction.options.getString("text");
      if (bioText.length > 80) return await interaction.reply({ content: "❌ Bio text must be 80 characters or less.", ephemeral: true });
      await redis.hset(`profile:${userId}`, "bio", bioText);
      return await interaction.reply({ content: "✅ Biography updated.", ephemeral: true });
    }

    // ==========================================
    // 🖼️ SUBCOMMAND: UPLOAD BACKGROUND (GLOBAL GATE)
    // ==========================================
    if (subcommand === "upload") {
      const isPremiumUser = await redis.get(`premium:user:${userId}`);

      if (interaction.user.id !== DEVELOPER_ID && !isPremiumUser) {
        return await interaction.reply({ 
          content: "❌ **Access Denied:** Custom image uploads are reserved for Global Premium Subscribers. Support the bot to unlock this feature!", 
          ephemeral: true 
        });
      }

      const attachment = interaction.options.getAttachment("image");
      if (!attachment.contentType || !attachment.contentType.startsWith("image/")) {
        return await interaction.reply({ content: "❌ File must be a valid image (PNG/JPG).", ephemeral: true });
      }

      await redis.hset(`profile:${userId}`, "custom_bg", attachment.url);
      return await interaction.reply({ content: "✅ Custom background applied successfully across the network!", ephemeral: true });
    }

    // ==========================================
    // 🔄 SUBCOMMAND: RESET BACKGROUND
    // ==========================================
    if (subcommand === "reset") {
      await redis.hdel(`profile:${userId}`, "custom_bg");
      return await interaction.reply({ content: "🔄 Custom background removed.", ephemeral: true });
    }

    // ==========================================
    // 🎨 SUBCOMMAND: VIEW PROFILE
    // ==========================================
    if (subcommand === "view") {
      await interaction.deferReply();
      const targetUser = interaction.options.getUser("target") || interaction.user;
      const isDev = targetUser.id === DEVELOPER_ID;

      // Fetch Profile & Leveling Data
      const profileData = await redis.hgetall(`profile:${targetUser.id}`) || {};
      const bio = profileData.bio || "No biography recorded yet. Use /profile setbio";
      const customBgUrl = profileData.custom_bg;
      const equippedBg = profileData.equipped || "classic";
      
      const level = parseInt(profileData.level) || 1;
      const currentXp = parseInt(profileData.xp) || 0;
      const xpNeeded = Math.floor(100 * Math.pow(level, 1.8));

      // ⏳ Fetch Premium Status & Expiration Time remaining
      const premiumKey = `premium:user:${targetUser.id}`;
      const isPremiumUser = await redis.get(premiumKey);
      const ttlSeconds = await redis.ttl(premiumKey); 

      let premiumStatusText = null;
      if (isDev) {
        premiumStatusText = "👑 CORE DEVELOPER";
      } else if (isPremiumUser === "perm") {
        premiumStatusText = "✨ PREMIUM (Lifetime)";
      } else if (isPremiumUser) {
        if (ttlSeconds > 0) {
          const daysLeft = Math.ceil(ttlSeconds / (24 * 60 * 60));
          premiumStatusText = `✨ PREMIUM (${daysLeft} Days Left)`;
        } else {
          premiumStatusText = "✨ PREMIUM (Active)";
        }
      }

      // Initialize Canvas Sizing
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

      // Card Highlight Colors (Gold frame for Premium Users, Neon Cyan for Dev, Purple for Normal)
      let themeColor = "#5865F2"; 
      if (isDev) themeColor = "#00FFFF"; 
      else if (isPremiumUser) themeColor = "#FFD700"; 

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

      // Typography Name Grid Layout
      ctx.fillStyle = "#ffffff";
      ctx.font = "32px CustomFont";
      
      let nameX = 220;
      let nameY = 85;

      if (isDev) {
        ctx.fillStyle = "#00FFFF";
        ctx.fillText("👑 [DEV]", nameX, nameY);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(targetUser.username, nameX + 155, nameY);
      } else if (isPremiumUser) {
        ctx.fillStyle = "#FFD700";
        ctx.fillText("👑", nameX, nameY);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(targetUser.username, nameX + 45, nameY);
      } else {
        ctx.fillText(targetUser.username, nameX, nameY);
      }

      // Draw Sub-Tier Premium Expiration Tag underneath name if active
      if (premiumStatusText) {
        ctx.font = "bold 14px CustomFont";
        ctx.fillStyle = isDev ? "#00FFFF" : "#FFD700";
        ctx.fillText(premiumStatusText, 220, 112);
      }

      // Draw Level Counter text Right-Aligned
      ctx.font = "bold 28px CustomFont";
      ctx.fillStyle = themeColor;
      const levelText = `LVL ${level}`;
      ctx.fillText(levelText, 760 - ctx.measureText(levelText).width, 85);

      // Draw User Biography line
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.font = "20px CustomFont";
      ctx.fillText(bio, 220, 155);

      // Progression Loading Bar Layout Parameters
      const barX = 220;
      const barY = 205;
      const barWidth = 540;
      const barHeight = 22;
      const radius = 11;

      const percentage = Math.min(currentXp / xpNeeded, 1);
      const progressWidth = barWidth * percentage;

      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth, barHeight, radius);
      ctx.fill();

      if (progressWidth > 0) {
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.roundRect(barX, barY, progressWidth, barHeight, radius);
        ctx.fill();
      }

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

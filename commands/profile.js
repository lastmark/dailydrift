const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

// 📂 Register the local font file so it works perfectly inside Railway containers
try {
  const fontPath = path.join(__dirname, "../font.ttf");
  GlobalFonts.registerFromPath(fontPath, "CustomFont");
} catch (fontError) {
  console.log("⚠️ Font registration skipped or file not found yet:", fontError.message);
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
        .setDescription("🔄 Clear your custom background image and revert back to default Noir.")
    ),

  async execute(interaction, client, redis) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    
    // 🔒 HARD-CODED DEVELOPER ACCREDITATION IDENTITY
    const DEVELOPER_ID = "1303357369622990889"; 

    // ==========================================
    // 📝 SUBCOMMAND: SET BIO
    // ==========================================
    if (subcommand === "setbio") {
      const bioText = interaction.options.getString("text");
      if (bioText.length > 80) {
        return await interaction.reply({ content: "❌ **Error:** Your canvas biography text must be 80 characters or less.", ephemeral: true });
      }

      await redis.hset(`profile:${userId}`, "bio", bioText);
      return await interaction.reply({ content: "✅ **Success:** Canvas profile typography text updated.", ephemeral: true });
    }

    // ==========================================
    // 🖼️ SUBCOMMAND: UPLOAD BACKGROUND
    // ==========================================
    if (subcommand === "upload") {
      const attachment = interaction.options.getAttachment("image");

      if (!attachment.contentType || !attachment.contentType.startsWith("image/")) {
        return await interaction.reply({ content: "❌ **Error:** The uploaded attachment must be a valid image file (PNG/JPG).", ephemeral: true });
      }

      await redis.hset(`profile:${userId}`, "custom_bg", attachment.url);
      return await interaction.reply({ content: "✅ **Success:** Your custom background has been uploaded and applied to your profile card!", ephemeral: true });
    }

    // ==========================================
    // 🔄 SUBCOMMAND: RESET BACKGROUND
    // ==========================================
    if (subcommand === "reset") {
      await redis.hdel(`profile:${userId}`, "custom_bg");
      return await interaction.reply({ content: "🔄 **Success:** Custom background removed. Reverting back to default background.", ephemeral: true });
    }

    // ==========================================
    // 🎨 SUBCOMMAND: VIEW PROFILE (GRAPHICS ENGINE)
    // ==========================================
    if (subcommand === "view") {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser("target") || interaction.user;
      const isDev = targetUser.id === DEVELOPER_ID;

      // 1. Fetch data profile fields from Redis
      const profileData = await redis.hgetall(`profile:${targetUser.id}`) || {};
      const bio = profileData.bio || "No biography recorded yet. Use /profile setbio";
      const customBgUrl = profileData.custom_bg;
      const equippedBg = profileData.equipped || "classic";

      // 2. Initialize Canvas Space (ProBot Style Blueprint Layout)
      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      // 3. Render Background Matrix Layer (Custom URL vs Standard Item Assets)
      try {
        let backgroundImage;
        if (customBgUrl) {
          backgroundImage = await loadImage(customBgUrl);
        } else {
          const bgPath = path.join(__dirname, `../backgrounds/${equippedBg}.png`); 
          backgroundImage = await loadImage(bgPath);
        }
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        // Safe database container fallback block if image links fail
        ctx.fillStyle = "#111111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 4. Dark Overlay Vignette
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 5. Render Neon Borders (Cyan Accent Highlight exclusively for the Developer Node)
      ctx.strokeStyle = isDev ? "#00FFFF" : "#5865F2";
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);

      // 6. Avatar Placement Loop (Slicing sharp clean circles)
      const avatarURL = targetUser.displayAvatarURL({ extension: "png", size: 256 });
      const avatarImg = await loadImage(avatarURL);

      ctx.save();
      ctx.beginPath();
      ctx.arc(110, 150, 75, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarImg, 35, 75, 150, 150);
      ctx.restore();

      // Avatar outer halo ring line
      ctx.beginPath();
      ctx.arc(110, 150, 76, 0, Math.PI * 2, true);
      ctx.strokeStyle = isDev ? "#00FFFF" : "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();

      // 7. Render Typography username elements
      ctx.fillStyle = "#ffffff";
      ctx.font = "34px CustomFont";
      
      let nameXPosition = 220;
      let nameYPosition = 120;

      if (isDev) {
        // Direct developer title badge printing
        ctx.fillStyle = "#00FFFF";
        ctx.fillText("👑 [DEV]", nameXPosition, nameYPosition);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(targetUser.username, nameXPosition + 155, nameYPosition);
      } else {
        ctx.fillText(targetUser.username, nameXPosition, nameYPosition);
      }

      // 8. Render Typography Bio text
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.font = "20px CustomFont";
      ctx.fillText(bio, 220, 175);

      // 9. Render Typography System Footprints
      ctx.fillStyle = isDev ? "#00FFFF" : "rgba(255, 255, 255, 0.4)";
      ctx.font = "14px CustomFont";
      const statusText = isDev ? "SYSTEM ACCESS: ROOT ADMINISTRATOR" : `USER ID: ${targetUser.id}`;
      ctx.fillText(statusText, 220, 235);

      // 10. Compile buffer array payloads and pipe to channel gateway
      const buffer = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(buffer, { name: `profile-${targetUser.id}.png` });

      return await interaction.editReply({ files: [attachment] });
    }
  }
};

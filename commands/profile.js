const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas"); // 👈 Added GlobalFonts
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
    .setDescription("👤 Generate an aesthetic, custom image profile card.")
    .addSubcommand(sub =>
      sub.setName("view")
        .setDescription("Render your graphical profile card layer.")
        .addUserOption(opt => opt.setName("target").setDescription("Select a user to inspect").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("setbio")
        .setDescription("Modify your personal database biography.")
        .addStringOption(opt => opt.setName("text").setDescription("Your new bio text (Max 80 chars)").setRequired(true))
    ),

  async execute(interaction, client, redis) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    
    // 🔒 HARD-CODED DEVELOPER IDENTITY CONTROL NODE
    const DEVELOPER_ID = "1303357369622990889"; // <--- Put your exact Discord ID string here!

    // ─── SUBCOMMAND: SET BIO ───
    if (subcommand === "setbio") {
      const bioText = interaction.options.getString("text");
      if (bioText.length > 80) {
        return await interaction.reply({ content: "❌ **Error:** Your canvas biography text must be 80 characters or less.", ephemeral: true });
      }

      await redis.hset(`profile:${userId}`, "bio", bioText);
      return await interaction.reply({ content: "✅ **Success:** Canvas profile typography text updated.", ephemeral: true });
    }

    // ─── SUBCOMMAND: VIEW PROFILE (CANVAS GRAPHICS ENGINE) ───
    if (subcommand === "view") {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser("target") || interaction.user;
      const isDev = targetUser.id === DEVELOPER_ID;

      // 1. Pull Bio Data from Redis
      const bio = await redis.hget(`profile:${targetUser.id}`, "bio") || "No biography recorded yet. Use /profile setbio";

      // 2. Initialize Canvas Dimensions
      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      // 3. Draw Background Base
      try {
        const bgPath = path.join(__dirname, "../background.png"); 
        const backgroundImage = await loadImage(bgPath);
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        ctx.fillStyle = "#111111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 4. Overlay Dark Vignette Shader
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 5. Render Neon Borders
      ctx.strokeStyle = isDev ? "#00FFFF" : "#5865F2";
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);

      // 6. Draw Avatar (Slicing an explicit circular frame)
      const avatarURL = targetUser.displayAvatarURL({ extension: "png", size: 256 });
      const avatarImg = await loadImage(avatarURL);

      ctx.save();
      ctx.beginPath();
      ctx.arc(110, 150, 75, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarImg, 35, 75, 150, 150);
      ctx.restore();

      // Draw avatar outer ring glow highlight
      ctx.beginPath();
      ctx.arc(110, 150, 76, 0, Math.PI * 2, true);
      ctx.strokeStyle = isDev ? "#00FFFF" : "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();

      // 7. Typography: Username System (Using Registered CustomFont)
      ctx.fillStyle = "#ffffff";
      ctx.font = "34px CustomFont"; // 👈 Swap sans-serif out for CustomFont
      
      let nameXPosition = 220;
      let nameYPosition = 120;

      if (isDev) {
        ctx.fillStyle = "#00FFFF";
        ctx.fillText("👑 [DEV]", nameXPosition, nameYPosition);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(targetUser.username, nameXPosition + 155, nameYPosition);
      } else {
        ctx.fillText(targetUser.username, nameXPosition, nameYPosition);
      }

      // 8. Typography: Bio Text System
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.font = "20px CustomFont"; // 👈 Swap sans-serif out for CustomFont
      ctx.fillText(bio, 220, 175);

      // 9. Typography: Extra Account Metadata Metrics Subtext
      ctx.fillStyle = isDev ? "#00FFFF" : "rgba(255, 255, 255, 0.4)";
      ctx.font = "14px CustomFont"; // 👈 Swap monospace out for CustomFont
      const statusText = isDev ? "SYSTEM ACCESS: ROOT ADMINISTRATOR" : `USER ID: ${targetUser.id}`;
      ctx.fillText(statusText, 220, 235);

      // 10. Process Buffer Output Array and Ship
      const buffer = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(buffer, { name: `profile-${targetUser.id}.png` });

      return await interaction.editReply({ files: [attachment] });
    }
  }
};

 

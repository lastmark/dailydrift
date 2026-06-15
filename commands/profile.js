const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const path = require("path");

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
      // Shortened to 80 characters so it fits beautifully on a single canvas row line
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

      // 2. Initialize Canvas Dimensions (ProBot style banner framework)
      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      // 3. Draw Background Base
      try {
        // Points to your background asset file
        const bgPath = path.join(__dirname, "../background.png"); 
        const backgroundImage = await loadImage(bgPath);
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        // Fallback color scheme if background.png is missing or fails to load
        ctx.fillStyle = "#111111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 4. Overlay Dark Vignette Shader (Gives it that gritty premium feel)
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 5. Render Neon Borders (Cyan highlight accent exclusively for the Dev Node)
      ctx.strokeStyle = isDev ? "#00FFFF" : "#5865F2";
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);

      // 6. Draw Avatar (Slicing an explicit circular frame)
      const avatarURL = targetUser.displayAvatarURL({ extension: "png", size: 256 });
      const avatarImg = await loadImage(avatarURL);

      ctx.save();
      ctx.beginPath();
      ctx.arc(110, 150, 75, 0, Math.PI * 2, true); // Circle path anchor coordinates
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

      // 7. Typography: Username System
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 34px sans-serif";
      
      let nameXPosition = 220;
      let nameYPosition = 120;

      if (isDev) {
        // Render custom Developer Crown Badge directly to raw pixel maps
        ctx.fillStyle = "#00FFFF";
        ctx.fillText("👑 [DEV]", nameXPosition, nameYPosition);
        // Offset username slightly to the right to fit the badge cleanly
        ctx.fillStyle = "#ffffff";
        ctx.fillText(targetUser.username, nameXPosition + 170, nameYPosition);
      } else {
        ctx.fillText(targetUser.username, nameXPosition, nameYPosition);
      }

      // 8. Typography: Bio Text System
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.font = "italic 20px sans-serif";
      ctx.fillText(bio, 220, 175);

      // 9. Typography: Extra Account Metadata Metrics Subtext
      ctx.fillStyle = isDev ? "#00FFFF" : "rgba(255, 255, 255, 0.4)";
      ctx.font = "14px monospace";
      const statusText = isDev ? "SYSTEM ACCESS: ROOT ADMINISTRATOR" : `USER ID: ${targetUser.id}`;
      ctx.fillText(statusText, 220, 235);

      // 10. Process Buffer Output Array and Ship to Discord Gateway channels
      const buffer = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(buffer, { name: `profile-${targetUser.id}.png` });

      return await interaction.editReply({ files: [attachment] });
    }
  }
};

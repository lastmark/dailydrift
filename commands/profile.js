const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");
const fs = require("fs");

const fontPath = path.join(__dirname, "../font.ttf");

try {
  if (fs.existsSync(fontPath)) {
    GlobalFonts.registerFromPath(fontPath, "CustomFont");
  }
} catch {}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Profile system")

    .addSubcommand(s =>
      s.setName("view")
        .setDescription("View profile")
        .addUserOption(o =>
          o.setName("target").setDescription("User")
        )
    )

    .addSubcommand(s =>
      s.setName("setbio")
        .setDescription("Set bio")
        .addStringOption(o =>
          o.setName("text").setDescription("Bio").setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("upload")
        .setDescription("Premium background")
        .addAttachmentOption(o =>
          o.setName("image").setDescription("Image").setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("reset")
        .setDescription("Reset profile")
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("target") || interaction.user;

    const profile = await redis.hgetall(`profile:${user.id}`) || {};

    // ================= BIO =================
    if (sub === "setbio") {
      const text = interaction.options.getString("text");
      await redis.hset(`profile:${interaction.user.id}`, "bio", text);
      return interaction.editReply("Bio updated");
    }

    // ================= UPLOAD BG =================
    if (sub === "upload") {
      const file = interaction.options.getAttachment("image");
      await redis.hset(`profile:${interaction.user.id}`, "custom_bg", file.url);
      return interaction.editReply("Uploaded BG");
    }

    // ================= RESET =================
    if (sub === "reset") {
      await redis.del(`profile:${interaction.user.id}`);
      return interaction.editReply("Reset done");
    }

    // ================= VIEW =================
    if (sub === "view") {

      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      const level = Number(profile.level || 1);
      const xp = Number(profile.xp || 0);
      const needed = 100 * level;
      const progress = Math.min(xp / needed, 1);

      // FRAME COLOR SYSTEM
      let frame = "#777";

      if (level >= 100) frame = "#FFD700";
      else if (level >= 75) frame = "#9B59B6";
      else if (level >= 50) frame = "#3498DB";
      else if (level >= 25) frame = "#2ECC71";

      // BACKGROUND
      let bg;

      try {
        if (profile.custom_bg) {
          bg = await loadImage(profile.custom_bg);

        } else if (profile.bg) {
          const shop = await redis.hgetall(`shop:bg:${profile.bg}`);
          if (shop?.url) bg = await loadImage(shop.url);

        } else {
          bg = await loadImage(path.join(__dirname, "../backgrounds/classic.png"));
        }
      } catch {}

      if (bg) ctx.drawImage(bg, 0, 0, 800, 300);

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, 800, 300);

      const avatar = await loadImage(
        user.displayAvatarURL({ extension: "png", size: 256 })
      );

      // AVATAR
      ctx.save();
      ctx.beginPath();
      ctx.arc(110, 130, 70, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 35, 55, 150, 150);
      ctx.restore();

      // FRAME (LEVEL BASED)
      ctx.strokeStyle = frame;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(110, 130, 74, 0, Math.PI * 2);
      ctx.stroke();

      // TEXT
      ctx.fillStyle = "#fff";
      ctx.font = "28px CustomFont";
      ctx.fillText(user.username, 220, 85);

      ctx.font = "18px CustomFont";
      ctx.fillText(profile.bio || "No bio", 220, 130);

      // XP BAR
      const x = 220, y = 190, w = 500, h = 18;

      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(x, y, w, h);

      ctx.fillStyle = "#5865F2";
      ctx.fillRect(x, y, w * progress, h);

      ctx.fillStyle = "#fff";
      ctx.font = "14px CustomFont";
      ctx.fillText(`${xp}/${needed} XP`, x + 10, y + 13);

      ctx.fillStyle = frame;
      ctx.font = "bold 22px CustomFont";
      ctx.fillText(`LVL ${level}`, 680, 85);

      const buffer = canvas.toBuffer("image/png");

      return interaction.editReply({
        files: [new AttachmentBuilder(buffer, { name: "profile.png" })]
      });
    }
  }
};

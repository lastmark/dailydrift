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

const bgList = {
  cyber1: "https://yourcdn.com/bg/cyber1.png",
  fire1: "https://yourcdn.com/bg/fire1.png",
  void1: "https://yourcdn.com/bg/void1.png",
  neon1: "https://yourcdn.com/bg/neon1.png"
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View profile system")
    .addSubcommand(s =>
      s.setName("view")
        .setDescription("View profile")
        .addUserOption(o =>
          o.setName("target").setDescription("User").setRequired(false)
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
        .setDescription("Premium custom background")
        .addAttachmentOption(o =>
          o.setName("image").setDescription("Image").setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("reset")
        .setDescription("Reset background")
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("target") || interaction.user;
    const userId = user.id;

    const data = (await redis.hgetall(`profile:${userId}`)) || {};

    /* ================= BIO ================= */
    if (sub === "setbio") {
      const text = interaction.options.getString("text");

      if (text.length > 80)
        return interaction.reply({ content: "Max 80 chars", ephemeral: true });

      await redis.hset(`profile:${interaction.user.id}`, "bio", text);
      return interaction.editReply("Bio updated");
    }

    /* ================= PREMIUM BG ================= */
    if (sub === "upload") {
      const file = interaction.options.getAttachment("image");

      if (!file.contentType?.startsWith("image/"))
        return interaction.editReply("Invalid image");

      await redis.hset(`profile:${interaction.user.id}`, "custom_bg", file.url);
      return interaction.editReply("Premium background saved");
    }

    /* ================= RESET ================= */
    if (sub === "reset") {
      await redis.hdel(`profile:${interaction.user.id}`, "custom_bg");
      return interaction.editReply("Reset done");
    }

    /* ================= VIEW ================= */
    if (sub === "view") {
      const bio = data.bio || "No bio set";
      const level = Number(data.level || 1);
      const xp = Number(data.xp || 0);
      const needed = 100 * level;
      const progress = Math.min(xp / needed, 1);

      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      let bg;

      try {
        // 1. Premium BG
        if (data.custom_bg) {
          bg = await loadImage(data.custom_bg);

        // 2. Shop BG
        } else if (data.bg && bgList[data.bg]) {
          bg = await loadImage(bgList[data.bg]);

        // 3. Default
        } else {
          bg = await loadImage(path.join(__dirname, "../backgrounds/classic.png"));
        }
      } catch {
        bg = null;
      }

      if (bg) ctx.drawImage(bg, 0, 0, 800, 300);
      else {
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, 800, 300);
      }

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, 800, 300);

      const avatar = await loadImage(
        user.displayAvatarURL({ extension: "png", size: 256 })
      );

      ctx.save();
      ctx.beginPath();
      ctx.arc(110, 130, 70, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 35, 55, 150, 150);
      ctx.restore();

      // frame
      ctx.strokeStyle = "#5865F2";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(110, 130, 72, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "28px CustomFont";
      ctx.fillText(user.username, 220, 85);

      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "18px CustomFont";
      ctx.fillText(bio, 220, 130);

      // XP bar
      const x = 220, y = 190, w = 500, h = 18;

      ctx.fillStyle = "rgba(255,255,255,0.15)";
      roundRect(ctx, x, y, w, h, 10);
      ctx.fill();

      ctx.fillStyle = "#5865F2";
      roundRect(ctx, x, y, w * progress, h, 10);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = "14px CustomFont";
      ctx.fillText(`${xp}/${needed} XP`, x + 10, y + 13);

      ctx.fillStyle = "#5865F2";
      ctx.font = "bold 22px CustomFont";
      ctx.fillText(`LVL ${level}`, 680, 85);

      const buffer = canvas.toBuffer("image/png");

      return interaction.editReply({
        files: [new AttachmentBuilder(buffer, { name: "profile.png" })]
      });
    }
  }
};

/* ================= HELPERS ================= */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.closePath();
}

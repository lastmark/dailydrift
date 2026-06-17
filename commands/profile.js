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
    .setDescription("View profile system")

    .addSubcommand(s =>
      s.setName("view")
        .setDescription("View profile")
        .addUserOption(o =>
          o.setName("target")
            .setDescription("User")
            .setRequired(false)
        )
    )

    .addSubcommand(s =>
      s.setName("setbio")
        .setDescription("Set bio")
        .addStringOption(o =>
          o.setName("text")
            .setDescription("Bio (max 80 chars)")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("upload")
        .setDescription("Premium custom background")
        .addAttachmentOption(o =>
          o.setName("image")
            .setDescription("Image")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("reset")
        .setDescription("Reset background")
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();

    // IMPORTANT: target logic fixed
    const target = interaction.options.getUser("target") || interaction.user;
    const userId = target.id;

    const key = `profile:${userId}`;
    const profile = (await redis.hgetall(key)) || {};

    // =========================
    // BIO
    // =========================
    if (sub === "setbio") {
      const text = interaction.options.getString("text");

      if (!text || text.length > 80)
        return interaction.editReply("Max 80 chars");

      await redis.hset(`profile:${interaction.user.id}`, "bio", text);
      return interaction.editReply("Bio updated");
    }

    // =========================
    // PREMIUM BG
    // =========================
    if (sub === "upload") {
      const file = interaction.options.getAttachment("image");

      if (!file?.contentType?.startsWith("image/"))
        return interaction.editReply("Invalid image");

      await redis.hset(`profile:${interaction.user.id}`, "custom_bg", file.url);
      return interaction.editReply("Premium background saved");
    }

    // =========================
    // RESET BG
    // =========================
    if (sub === "reset") {
      await redis.hdel(`profile:${interaction.user.id}`, "custom_bg");
      await redis.hdel(`profile:${interaction.user.id}`, "bg");
      return interaction.editReply("Reset done");
    }

    // =========================
    // VIEW PROFILE
    // =========================
    if (sub === "view") {
      const bio = profile.bio || "No bio set";
      const level = Number(profile.level || 1);
      const xp = Number(profile.xp || 0);
      const needed = 100 * level;
      const progress = Math.min(xp / needed, 1);

      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      let bg = null;

      try {
        // 1. PREMIUM BG (highest priority)
        if (profile.custom_bg) {
          bg = await loadImage(profile.custom_bg);

        // 2. SHOP BG (FIXED SAFE LOOKUP)
        } else if (profile.bg) {
          const shopItem = await redis.hgetall(`shop:bg:${profile.bg}`);

          if (shopItem && shopItem.url) {
            bg = await loadImage(shopItem.url);
          }

        // 3. DEFAULT
        } else {
          bg = await loadImage(
            path.join(__dirname, "../backgrounds/classic.png")
          );
        }
      } catch (e) {
        bg = null;
      }

      // background render
      if (bg) {
        ctx.drawImage(bg, 0, 0, 800, 300);
      } else {
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, 800, 300);
      }

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, 800, 300);

      // =========================
      // AVATAR
      // =========================
      const avatar = await loadImage(
        target.displayAvatarURL({ extension: "png", size: 256 })
      );

      const ax = 110, ay = 130;

      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, ay, 70, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 35, 55, 150, 150);
      ctx.restore();

      // FRAME
      ctx.strokeStyle = "#5865F2";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ax, ay, 72, 0, Math.PI * 2);
      ctx.stroke();

      // TEXT
      ctx.fillStyle = "#fff";
      ctx.font = "28px CustomFont";
      ctx.fillText(target.username, 220, 85);

      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "18px CustomFont";
      ctx.fillText(bio, 220, 130);

      // XP BAR
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

// =========================
// HELPERS
// =========================
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

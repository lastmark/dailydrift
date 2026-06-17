const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

try {
  GlobalFonts.registerFromPath(
    path.join(__dirname, "../font.ttf"),
    "CustomFont"
  );
} catch {}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile system")
    .addSubcommand(s =>
      s
        .setName("view")
        .setDescription("View profile")
        .addUserOption(o => o.setName("target"))
    )
    .addSubcommand(s =>
      s
        .setName("setbio")
        .setDescription("Set bio")
        .addStringOption(o =>
          o.setName("text").setRequired(true)
        )
    )
    .addSubcommand(s =>
      s
        .setName("upload")
        .setDescription("Set background")
        .addAttachmentOption(o =>
          o.setName("image").setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("reset").setDescription("Reset background")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    /* ================= BIO ================= */
    if (sub === "setbio") {
      const text = interaction.options.getString("text");

      if (text.length > 80)
        return interaction.reply({ content: "Max 80 chars", ephemeral: true });

      await redis.hset(`profile:${userId}`, "bio", text);
      return interaction.reply({ content: "Bio updated", ephemeral: true });
    }

    /* ================= UPLOAD BG ================= */
    if (sub === "upload") {
      const file = interaction.options.getAttachment("image");

      if (!file.contentType?.startsWith("image/"))
        return interaction.reply({ content: "Invalid image", ephemeral: true });

      await redis.hset(`profile:${userId}`, "custom_bg", file.url);

      return interaction.reply({ content: "Background saved", ephemeral: true });
    }

    /* ================= RESET ================= */
    if (sub === "reset") {
      await redis.hdel(`profile:${userId}`, "custom_bg");
      return interaction.reply({ content: "Reset done", ephemeral: true });
    }

    /* ================= VIEW ================= */
    if (sub === "view") {
      await interaction.deferReply();

      const target = interaction.options.getUser("target") || interaction.user;

      const data = (await redis.hgetall(`profile:${target.id}`)) || {};

      const bio = data.bio || "No bio set";
      const bg = data.custom_bg;

      // SAFE XP SYSTEM
      const xp = Number(data.xp || 0);
      const level = Number(data.level || 1);

      const needed = 100 * level;
      const progress = Math.min(xp / needed, 1);

      /* ================= CANVAS ================= */
      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      try {
        const image = bg
          ? await loadImage(bg)
          : await loadImage(path.join(__dirname, "../backgrounds/classic.png"));

        ctx.drawImage(image, 0, 0, 800, 300);
      } catch {
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, 800, 300);
      }

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, 800, 300);

      /* ================= AVATAR ================= */
      const avatar = await loadImage(
        target.displayAvatarURL({ extension: "png", size: 256 })
      );

      ctx.save();
      ctx.beginPath();
      ctx.arc(110, 130, 70, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 35, 55, 150, 150);
      ctx.restore();

      ctx.strokeStyle = "#5865F2";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(110, 130, 72, 0, Math.PI * 2);
      ctx.stroke();

      /* ================= NAME ================= */
      ctx.fillStyle = "#fff";
      ctx.font = "28px CustomFont";
      ctx.fillText(target.username, 220, 85);

      /* ================= BIO ================= */
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "18px CustomFont";
      ctx.fillText(bio, 220, 130);

      /* ================= XP BAR ================= */
      const x = 220;
      const y = 190;
      const w = 500;
      const h = 18;

      // BG bar
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      roundRect(ctx, x, y, w, h, 10);
      ctx.fill();

      // XP fill
      ctx.fillStyle = "#5865F2";
      roundRect(ctx, x, y, w * progress, h, 10);
      ctx.fill();

      // XP TEXT
      ctx.fillStyle = "#fff";
      ctx.font = "14px CustomFont";
      ctx.fillText(`${xp} / ${needed} XP`, x + 10, y + 13);

      /* ================= LEVEL ================= */
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

/* ================= UTIL ================= */
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

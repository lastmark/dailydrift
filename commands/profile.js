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
    .setDescription("View your profile system")
    .addSubcommand(s =>
      s.setName("view")
        .setDescription("View a user profile")
        .addUserOption(o =>
          o.setName("target")
            .setDescription("User to view")
            .setRequired(false)
        )
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const target = interaction.options.getUser("target") || interaction.user;
    const data = (await redis.hgetall(`profile:${target.id}`)) || {};

    const bio = data.bio || "No bio set";
    const bg = data.custom_bg;

    const level = Number(data.level || 1);
    const xp = Number(data.xp || 0);
    const needed = 100 * level;
    const progress = Math.min(xp / needed, 1);

    const canvas = createCanvas(800, 300);
    const ctx = canvas.getContext("2d");

    const tick = Date.now() / 50; // animation driver

    // =========================
    // BACKGROUND
    // =========================
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

    // =========================
    // FRAME SYSTEM
    // =========================
    function getFrame(level) {
      if (level >= 120) return { glow: "#FFD700", accent: "#FFF3A0", name: "mythic" };
      if (level >= 100) return { glow: "#FF3B3B", accent: "#FF8A00", name: "fire" };
      if (level >= 75) return { glow: "#00D4FF", accent: "#66F2FF", name: "diamond" };
      if (level >= 50) return { glow: "#9B59B6", accent: "#C39BD3", name: "elite" };
      if (level >= 25) return { glow: "#3498DB", accent: "#85C1E9", name: "rare" };
      return { glow: "#5865F2", accent: "#7289DA", name: "basic" };
    }

    const frame = getFrame(level);

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

    // =========================
    // FRAME DRAW (ADVANCED)
    // =========================
    function drawFrame() {
      const t = tick / 10;

      // 🌌 outer aura
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(t) * 0.05;
      ctx.strokeStyle = hexToRGBA(frame.glow, 0.3);
      ctx.lineWidth = 28;
      ctx.beginPath();
      ctx.arc(ax, ay, 82, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ⚡ main energy ring
      ctx.save();
      ctx.strokeStyle = frame.glow;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 6 + Math.sin(t) * 1.5;
      ctx.beginPath();
      ctx.arc(ax, ay, 74, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 🧿 inner clean ring
      ctx.save();
      ctx.strokeStyle = "#fff";
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ax, ay, 70, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ✨ PARTICLES (ORBIT SYSTEM)
      const particles = Math.min(4 + Math.floor(level / 10), 18);

      for (let i = 0; i < particles; i++) {
        const angle = (i / particles) * Math.PI * 2 + t;
        const radius = 88;

        const px = ax + Math.cos(angle) * radius;
        const py = ay + Math.sin(angle) * radius;

        ctx.fillStyle = frame.accent;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;

      // ⚡ light sweep effect
      const grad = ctx.createLinearGradient(0, 0, 800, 300);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(0.5, "rgba(255,255,255,0.15)");
      grad.addColorStop(1, "transparent");

      ctx.strokeStyle = grad;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(ax, ay, 72, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawFrame();

    // =========================
    // TEXT
    // =========================
    ctx.fillStyle = "#fff";
    ctx.font = "28px CustomFont";
    ctx.fillText(target.username, 220, 85);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "18px CustomFont";
    ctx.fillText(bio, 220, 130);

    // =========================
    // XP BAR
    // =========================
    const x = 220, y = 190, w = 500, h = 18;

    ctx.fillStyle = "rgba(255,255,255,0.15)";
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();

    ctx.fillStyle = frame.glow;
    roundRect(ctx, x, y, w * progress, h, 10);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "14px CustomFont";
    ctx.fillText(`${xp} / ${needed} XP`, x + 10, y + 13);

    // LEVEL
    ctx.fillStyle = frame.glow;
    ctx.font = "bold 22px CustomFont";
    ctx.fillText(`LVL ${level}`, 680, 85);

    // =========================
    // OUTPUT
    // =========================
    const buffer = canvas.toBuffer("image/png");

    return interaction.editReply({
      files: [new AttachmentBuilder(buffer, { name: "profile.png" })]
    });
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

function hexToRGBA(hex, a) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

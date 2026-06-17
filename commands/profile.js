const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");
const fs = require("fs");

const fontPath = path.join(__dirname, "../font.ttf");

try {
  if (fs.existsSync(fontPath)) {
    GlobalFonts.registerFromPath(fontPath, "CustomFont");
  }
} catch (err) {
  console.log("Font load error:", err.message);
}

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

    // =========================
    // FRAME SYSTEM (DESIGN BASED)
    // =========================
    function getFrame(level) {
      if (level >= 120) {
        return {
          type: "mythic",
          glow: "#FFD700",
          accent: "#FFF3A0"
        };
      }
      if (level >= 100) {
        return {
          type: "fire",
          glow: "#FF3B3B",
          accent: "#FF8A00"
        };
      }
      if (level >= 75) {
        return {
          type: "diamond",
          glow: "#00D4FF",
          accent: "#66F2FF"
        };
      }
      if (level >= 50) {
        return {
          type: "elite",
          glow: "#9B59B6",
          accent: "#C39BD3"
        };
      }
      if (level >= 25) {
        return {
          type: "rare",
          glow: "#3498DB",
          accent: "#85C1E9"
        };
      }

      return {
        type: "basic",
        glow: "#5865F2",
        accent: "#7289DA"
      };
    }

    const frame = getFrame(level);

    // =========================
    // CANVAS
    // =========================
    const canvas = createCanvas(800, 300);
    const ctx = canvas.getContext("2d");

    // Background
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
    // AVATAR
    // =========================
    const avatar = await loadImage(
      target.displayAvatarURL({ extension: "png", size: 256 })
    );

    ctx.save();
    ctx.beginPath();
    ctx.arc(110, 130, 70, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 35, 55, 150, 150);
    ctx.restore();

    // =========================
    // FRAME DESIGN SYSTEM
    // =========================
    function drawFrame() {
      const x = 110;
      const y = 130;

      // OUTER GLOW (aura)
      ctx.strokeStyle = hexToRGBA(frame.glow, 0.25);
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.arc(x, y, 78, 0, Math.PI * 2);
      ctx.stroke();

      // MID GLOW ring
      ctx.strokeStyle = hexToRGBA(frame.glow, 0.6);
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(x, y, 74, 0, Math.PI * 2);
      ctx.stroke();

      // INNER SHARP FRAME
      ctx.strokeStyle = frame.glow;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 70, 0, Math.PI * 2);
      ctx.stroke();

      // SPECIAL SHAPES PER LEVEL TYPE
      if (frame.type === "diamond") {
        drawDiamondCorners(x, y);
      }

      if (frame.type === "fire") {
        drawFireAura(x, y);
      }

      if (frame.type === "mythic") {
        drawMythicGlow(x, y);
      }
    }

    // Diamond corners (elite look)
    function drawDiamondCorners(x, y) {
      ctx.strokeStyle = "#00E5FF";
      ctx.lineWidth = 2;

      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const dx = x + Math.cos(angle) * 85;
        const dy = y + Math.sin(angle) * 85;

        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx + 6, dy + 6);
        ctx.stroke();
      }
    }

    // Fire aura effect
    function drawFireAura(x, y) {
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = `rgba(255, 80, 0, ${0.1 * i})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 75 + i * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Mythic golden pulse
    function drawMythicGlow(x, y) {
      ctx.strokeStyle = "rgba(255,215,0,0.8)";
      ctx.lineWidth = 4;

      ctx.beginPath();
      ctx.arc(x, y, 76, 0, Math.PI * 2);
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

// convert hex → rgba
function hexToRGBA(hex, a) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

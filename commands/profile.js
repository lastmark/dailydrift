const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

try {
  GlobalFonts.registerFromPath(path.join(__dirname, "../font.ttf"), "CustomFont");
} catch {}

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

function getFrameStyle(level) {
  if (level >= 120) return ["#00f5ff", "#ff00ff", "#ffd700"];
  if (level >= 100) return ["#ff3b3b", "#ff7a00"];
  if (level >= 75) return ["#ffd700", "#ffcc00"];
  if (level >= 50) return ["#a855f7", "#7c3aed"];
  if (level >= 25) return ["#00b4ff", "#5865f2"];
  return ["#2b2d31"];
}

function drawFrame(ctx, level, w, h) {
  const colors = getFrameStyle(level);

  // Outer glow layers
  for (let i = 0; i < colors.length; i++) {
    ctx.strokeStyle = colors[i];
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 10 + i * 3;

    ctx.beginPath();
    roundRect(ctx, 5 + i * 2, 5 + i * 2, w - 10 - i * 4, h - 10 - i * 4, 18);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // Main border
  ctx.strokeStyle = colors[0];
  ctx.lineWidth = 3;
  roundRect(ctx, 8, 8, w - 16, h - 16, 16);
  ctx.stroke();

  // Corner highlights
  const corners = [
    [20, 20],
    [w - 20, 20],
    [20, h - 20],
    [w - 20, h - 20]
  ];

  ctx.fillStyle = colors[0];
  for (const [x, y] of corners) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View profile system")
    .addSubcommand(s =>
      s.setName("view")
        .setDescription("View profile")
        .addUserOption(o => o.setName("target"))
    )
    .addSubcommand(s =>
      s.setName("setbio")
        .setDescription("Set bio")
        .addStringOption(o => o.setName("text").setRequired(true))
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();

    if (sub === "setbio") {
      const text = interaction.options.getString("text");

      if (text.length > 80)
        return interaction.reply({ content: "Max 80 chars", ephemeral: true });

      await redis.hset(`profile:${interaction.user.id}`, "bio", text);
      return interaction.reply({ content: "Bio updated", ephemeral: true });
    }

    if (sub === "view") {
      await interaction.deferReply();

      const target = interaction.options.getUser("target") || interaction.user;
      const data = (await redis.hgetall(`profile:${target.id}`)) || {};

      const bio = data.bio || "No bio set";
      const xp = Number(data.xp || 0);
      const level = Number(data.level || 1);

      const needed = 100 * level;
      const progress = Math.min(xp / needed, 1);

      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      // Background
      try {
        const bg = await loadImage(
          path.join(__dirname, "../backgrounds/classic.png")
        );
        ctx.drawImage(bg, 0, 0, 800, 300);
      } catch {
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, 800, 300);
      }

      // Dark overlay
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, 800, 300);

      // Avatar
      const avatar = await loadImage(
        target.displayAvatarURL({ extension: "png", size: 256 })
      );

      ctx.save();
      ctx.beginPath();
      ctx.arc(110, 130, 70, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 35, 55, 150, 150);
      ctx.restore();

      // Name
      ctx.fillStyle = "#fff";
      ctx.font = "28px CustomFont";
      ctx.fillText(target.username, 220, 85);

      // Bio
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "18px CustomFont";
      ctx.fillText(bio, 220, 130);

      // XP BAR
      const x = 220, y = 190, w = 500, h = 18;

      ctx.fillStyle = "rgba(255,255,255,0.12)";
      roundRect(ctx, x, y, w, h, 10);
      ctx.fill();

      ctx.fillStyle = "#5865f2";
      roundRect(ctx, x, y, w * progress, h, 10);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = "14px CustomFont";
      ctx.fillText(`${xp} / ${needed} XP`, x + 10, y + 13);

      // Level
      ctx.fillStyle = "#fff";
      ctx.font = "bold 22px CustomFont";
      ctx.fillText(`LVL ${level}`, 680, 85);

      // 🔥 CUSTOM CANVAS FRAME
      drawFrame(ctx, level, 800, 300);

      const buffer = canvas.toBuffer("image/png");

      return interaction.editReply({
        files: [new AttachmentBuilder(buffer, { name: "profile.png" })]
      });
    }
  }
};

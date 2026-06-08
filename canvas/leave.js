const { createCanvas, loadImage } = require("canvas");

async function leaveCard(user, guild) {
  const canvas = createCanvas(800, 250);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, 800, 250);

  ctx.fillStyle = "#ff4d4d";
  ctx.font = "28px sans-serif";
  ctx.fillText(`Goodbye ${user.username}`, 250, 120);

  ctx.font = "18px sans-serif";
  ctx.fillText(`Left ${guild.name}`, 250, 160);

  const avatar = await loadImage(user.displayAvatarURL({ extension: "png" }));
  ctx.drawImage(avatar, 50, 50, 150, 150);

  return canvas.toBuffer();
}

module.exports = { leaveCard };

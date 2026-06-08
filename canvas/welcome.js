const { createCanvas, loadImage } = require("canvas");

async function welcomeCard(user, guild) {
  const canvas = createCanvas(800, 250);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f0f0f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "28px sans-serif";
  ctx.fillText(`Welcome ${user.username}`, 250, 120);

  ctx.font = "18px sans-serif";
  ctx.fillText(`Server: ${guild.name}`, 250, 160);

  const avatar = await loadImage(user.displayAvatarURL({ extension: "png" }));
  ctx.drawImage(avatar, 50, 50, 150, 150);

  return canvas.toBuffer();
}

module.exports = { welcomeCard };

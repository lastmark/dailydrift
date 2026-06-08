const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");

// Register the custom font (Make sure the path and filename match your project)
registerFont(path.join(__dirname, "..", "font.ttf"), {
  family: "CustomFontName" 
});

async function leaveCard(user, guild) {
  const canvas = createCanvas(800, 250);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height); // Optimized to use canvas dimensions

  ctx.fillStyle = "#ff4d4d";
  // Updated to use the custom font
  ctx.font = "28px 'CustomFontName'";
  ctx.fillText(`Goodbye ${user.username}`, 250, 120);

  ctx.font = "18px 'CustomFontName'";
  ctx.fillText(`Left ${guild.name}`, 250, 160);

  const avatar = await loadImage(user.displayAvatarURL({ extension: "png" }));
  ctx.drawImage(avatar, 50, 50, 150, 150);

  return canvas.toBuffer();
}

module.exports = { leaveCard };

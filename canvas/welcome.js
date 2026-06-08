const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");

// Register the custom font before using it in the function
// Replace 'path/to/font.ttf' with the actual path to your font file, e.g., './fonts/MyCustomFont.ttf'
registerFont(path.join(__dirname, "fonts/MyCustomFont.ttf"), {
  family: "CustomFontName" // This is the name you will use in ctx.font
});

async function welcomeCard(user, guild) {
  const canvas = createCanvas(800, 250);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f0f0f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  // Use your newly registered font name here
  ctx.font = "28px 'CustomFontName'";
  ctx.fillText(`Welcome ${user.username}`, 250, 120);

  ctx.font = "18px 'CustomFontName'";
  ctx.fillText(`Server: ${guild.name}`, 250, 160);

  const avatar = await loadImage(user.displayAvatarURL({ extension: "png" }));
  ctx.drawImage(avatar, 50, 50, 150, 150);

  return canvas.toBuffer();
}

module.exports = { welcomeCard };

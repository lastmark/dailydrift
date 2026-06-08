const { createCanvas, loadImage } = require("canvas");
const { AttachmentBuilder } = require("discord.js");

async function generateWelcomeImage(user, guild, customMsg, bgUrl = null) {
  const width = 800, height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // background
  if (bgUrl) {
    try {
      const bg = await loadImage(bgUrl);
      ctx.drawImage(bg, 0, 0, width, height);
    } catch { drawGradient(ctx, width, height); }
  } else drawGradient(ctx, width, height);

  // dark overlay
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, width, height);

  // avatar
  const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
  const size = 128;
  ctx.save();
  ctx.beginPath();
  ctx.arc(width/2, 80, size/2, 0, Math.PI*2);
  ctx.clip();
  ctx.drawImage(avatar, width/2 - size/2, 80 - size/2, size, size);
  ctx.restore();

  // text
  ctx.font = "bold 32px 'Arial'";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(`Welcome ${user.username}`, width/2, 180);
  ctx.font = "24px 'Arial'";
  ctx.fillStyle = "#ddd";
  ctx.fillText(guild.name, width/2, 230);
  if (customMsg) {
    ctx.font = "20px 'Arial'";
    ctx.fillStyle = "#ccc";
    ctx.fillText(customMsg, width/2, 300);
  }

  return new AttachmentBuilder(canvas.toBuffer(), { name: "welcome.png" });
}

async function generateLeaveImage(user, guild, customMsg, bgUrl = null) {
  // similar – same dimensions, text "Goodbye {username}"
  const width = 800, height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (bgUrl) {
    try {
      const bg = await loadImage(bgUrl);
      ctx.drawImage(bg, 0, 0, width, height);
    } catch { drawGradient(ctx, width, height); }
  } else drawGradient(ctx, width, height);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, width, height);
  const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
  const size = 128;
  ctx.save();
  ctx.beginPath();
  ctx.arc(width/2, 80, size/2, 0, Math.PI*2);
  ctx.clip();
  ctx.drawImage(avatar, width/2 - size/2, 80 - size/2, size, size);
  ctx.restore();
  ctx.font = "bold 32px 'Arial'";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(`Goodbye ${user.username}`, width/2, 180);
  if (customMsg) {
    ctx.font = "20px 'Arial'";
    ctx.fillStyle = "#ccc";
    ctx.fillText(customMsg, width/2, 250);
  }
  return new AttachmentBuilder(canvas.toBuffer(), { name: "leave.png" });
}

function drawGradient(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#2c3e50");
  grad.addColorStop(1, "#1a2632");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

async function drawPictureWord(word) {
  const canvas = createCanvas(500, 500);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, 500, 500);
  ctx.fillStyle = "#000";
  ctx.font = "30px 'Arial'";
  ctx.textAlign = "center";
  // simple drawings for demonstration – extend as needed
  switch(word) {
    case "apple":
      ctx.fillStyle = "#e74c3c";
      ctx.beginPath();
      ctx.ellipse(250, 250, 100, 110, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(245, 140, 10, 40);
      break;
    case "cat":
      ctx.fillStyle = "#f39c12";
      ctx.beginPath();
      ctx.ellipse(250, 250, 90, 100, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(215, 220, 10, 0, Math.PI*2);
      ctx.arc(285, 220, 10, 0, Math.PI*2);
      ctx.fill();
      break;
    default:
      ctx.fillStyle = "#555";
      ctx.fillText(word, 250, 250);
  }
  return new AttachmentBuilder(canvas.toBuffer(), { name: "picture.png" });
}

module.exports = { generateWelcomeImage, generateLeaveImage, drawPictureWord };

const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");

registerFont(path.join(__dirname, "..", "font.ttf"), { family: "CustomFontName" });

async function welcomeCard(user, guild, redis) {
  const canvas = createCanvas(800, 250);
  const ctx = canvas.getContext("2d");
  const guildId = guild.id;

  // Premium Background Check
  const isGuildPremium = await redis.get(`premium:guild:${guildId}`) !== null;
  let backgroundLoaded = false;

  if (isGuildPremium) {
    const customBgUrl = await redis.get(`welcome:bg:${guildId}`);
    if (customBgUrl) {
      try {
        const bgImg = await loadImage(customBgUrl);
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
        backgroundLoaded = true;
      } catch (err) {
        console.error(`[CANVAS] Failed to render premium welcome bg: ${customBgUrl}`, err);
      }
    }
  }

  if (!backgroundLoaded) {
    ctx.fillStyle = "#0f0f0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Base Identity Card Typography
  ctx.fillStyle = "#ffffff";
  ctx.font = "32px 'CustomFontName'";
  ctx.fillText("MEMBER JOINED", 250, 110);

  ctx.fillStyle = "#aaaaaa";
  ctx.font = "20px 'CustomFontName'";
  ctx.fillText(`${user.username.toUpperCase()}`, 250, 155);

  // Avatar Circle/Square Frame
  try {
    const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(45, 45, 160, 160);
    ctx.drawImage(avatar, 50, 50, 150, 150);
  } catch (err) {
    console.error("[CANVAS] Avatar stream error:", err);
  }

  return canvas.toBuffer();
}

module.exports = { welcomeCard };

// canvas/welcome.js – Dynamic Welcome Canvas Generator
const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");

// Register assets
registerFont(path.join(__dirname, "..", "font.ttf"), { family: "CustomFontName" });

async function welcomeCard(user, guild, db) {
  const canvas = createCanvas(800, 250);
  const ctx = canvas.getContext("2d");
  const guildId = guild.id;

  // --- Configuration Retrieval ---
  const isGuildPremium = (await db.get(`premium:guild:${guildId}`)) !== null;
  const customBgUrl = isGuildPremium ? await db.get(`welcome:bg:${guildId}`) : null;

  // --- Background Rendering ---
  let backgroundLoaded = false;
  if (customBgUrl) {
    try {
      const bgImg = await loadImage(customBgUrl);
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
      backgroundLoaded = true;
    } catch (err) {
      console.error(`[CANVAS] Premium Welcome BG Load Failure: ${customBgUrl}`, err);
    }
  }

  if (!backgroundLoaded) {
    ctx.fillStyle = "#0A0A0A"; // Consistent dark theme
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // --- Identity Layer ---
  ctx.fillStyle = "#ffffff";
  ctx.font = "32px 'CustomFontName'";
  ctx.fillText("MEMBER JOINED", 250, 110);

  ctx.fillStyle = "#aaaaaa";
  ctx.font = "20px 'CustomFontName'";
  ctx.fillText(`${user.username.toUpperCase()}`, 250, 155);

  // --- Avatar Rendering ---
  try {
    const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
    
    // Avatar Stroke & Frame
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 4;
    ctx.strokeRect(45, 45, 160, 160);
    
    ctx.drawImage(avatar, 50, 50, 150, 150);
  } catch (err) {
    console.error("[CANVAS] Avatar rendering fault:", err);
  }

  return canvas.toBuffer();
}

module.exports = { welcomeCard };

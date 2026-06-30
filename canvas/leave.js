const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");

// Register the custom font (Make sure the path and filename match your project)
registerFont(path.join(__dirname, "..", "font.ttf"), {
  family: "CustomFontName" 
});

async function leaveCard(user, guild, redis) {
  const canvas = createCanvas(800, 250);
  const ctx = canvas.getContext("2d");
  const guildId = guild.id;

  // ─── 🛡️ PREMIUM CHECK: CHECK FOR CUSTOM CANVAS BACKGROUND ───
  const isGuildPremium = await redis.get(`premium:guild:${guildId}`) !== null;
  let backgroundLoaded = false;

  if (isGuildPremium) {
    const customBgUrl = await redis.get(`leave:bg:${guildId}`);
    if (customBgUrl) {
      try {
        const bgImg = await loadImage(customBgUrl);
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
        backgroundLoaded = true;
      } catch (err) {
        console.error(`[CANVAS ENGINE] Failed to pre-render custom background URL: ${customBgUrl}`, err);
      }
    }
  }

  // Fallback to gritty dark minimalist canvas if no image was successfully drawn
  if (!backgroundLoaded) {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ─── 📝 TEXT CONFIGURATION MATRIX ───
  // Fetch custom template string from database, or default to standard fallback structure
  const rawTemplate = await redis.get(`leave:text:${guildId}`) || "Goodbye {user}\nLeft {server}";
  
  // Format variables cleanly
  const formattedText = rawTemplate
    .replace(/{user}/g, user.username)
    .replace(/{server}/g, guild.name)
    .replace(/{count}/g, guild.memberCount.toLocaleString());

  // Split string into lines to support clean multi-line layouts
  const scriptLines = formattedText.split("\n");

  // Render text configuration rows dynamically
  ctx.fillStyle = "#ff4d4d"; // Accent Red
  ctx.font = "28px 'CustomFontName'";
  
  if (scriptLines[0]) {
    ctx.fillText(scriptLines[0], 250, 110);
  }

  ctx.fillStyle = "#ffffff"; // Secondary text white override
  ctx.font = "18px 'CustomFontName'";
  
  if (scriptLines[1]) {
    ctx.fillText(scriptLines[1], 250, 155);
  } else if (!scriptLines[1] && scriptLines[0] === rawTemplate) {
    // If they typed a single line message without a newline split, display a default metric row
    ctx.fillText(`Total Server Members: ${guild.memberCount.toLocaleString()}`, 250, 155);
  }

  // ─── 👤 AVATAR LAYER RENDER ───
  try {
    const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
    
    // Optional: Draw a subtle back ring/glow layer behind the profile picture
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(45, 45, 160, 160);

    ctx.drawImage(avatar, 50, 50, 150, 150);
  } catch (err) {
    console.error("[CANVAS ENGINE] Unable to bind user avatar asset stream:", err);
  }

  return canvas.toBuffer();
}

module.exports = { leaveCard };

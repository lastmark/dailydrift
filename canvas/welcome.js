const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");

// Register the custom font before using it in the function
registerFont(path.join(__dirname, "..", "font.ttf"), {
  family: "CustomFontName" 
});

async function welcomeCard(user, guild, redis) {
  const canvas = createCanvas(800, 250);
  const ctx = canvas.getContext("2d");
  const guildId = guild.id;

  // ─── 🛡️ PREMIUM CHECK: CHECK FOR CUSTOM CANVAS BACKGROUND ───
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
        console.error(`[CANVAS ENGINE] Failed to pre-render custom welcome background URL: ${customBgUrl}`, err);
      }
    }
  }

  // Fallback to gritty dark minimalist canvas if no image was successfully drawn
  if (!backgroundLoaded) {
    ctx.fillStyle = "#0f0f0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ─── 📝 TEXT CONFIGURATION MATRIX ───
  // Fetch custom template string from database, or default to standard fallback structure
  const rawTemplate = await redis.get(`welcome:text:${guildId}`) || "Welcome {user}\nServer: {server}";
  
  // Format variables cleanly
  const formattedText = rawTemplate
    .replace(/{user}/g, user.username)
    .replace(/{server}/g, guild.name)
    .replace(/{count}/g, guild.memberCount.toLocaleString());

  // Split string into lines to support clean multi-line layouts
  const scriptLines = formattedText.split("\n");

  // Render text configuration rows dynamically
  ctx.fillStyle = "#ffffff"; // Main Welcome text
  ctx.font = "28px 'CustomFontName'";
  
  if (scriptLines[0]) {
    ctx.fillText(scriptLines[0], 250, 110);
  }

  ctx.fillStyle = "#aaaaaa"; // Secondary details subtle gray
  ctx.font = "18px 'CustomFontName'";
  
  if (scriptLines[1]) {
    ctx.fillText(scriptLines[1], 250, 155);
  } else if (!scriptLines[1] && scriptLines[0] === rawTemplate) {
    // Fallback if no multi-line string split is found
    ctx.fillText(`Member Count: #${guild.memberCount.toLocaleString()}`, 250, 155);
  }

  // ─── 👤 AVATAR LAYER RENDER ───
  try {
    const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
    
    // Draw background border block for the avatar
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(45, 45, 160, 160);

    ctx.drawImage(avatar, 50, 50, 150, 150);
  } catch (err) {
    console.error("[CANVAS ENGINE] Unable to bind user avatar asset stream:", err);
  }

  return canvas.toBuffer();
}

module.exports = { welcomeCard };

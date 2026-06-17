// commands/profile.js – PREMIUM FROM REDEEM CODES
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require("discord.js");
const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");
const fs = require("fs");

// ---------- FONT SETUP ----------
const fontPath = path.join(__dirname, "../font.ttf");
let customFontLoaded = false;
try {
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family: "CustomFont" });
    customFontLoaded = true;
    console.log("✅ Custom font loaded.");
  } else {
    console.warn("⚠️ font.ttf not found – using fallback Arial.");
  }
} catch {
  console.warn("⚠️ Font registration failed – using fallback Arial.");
}

function getFont(weight = "normal", size = 16) {
  const family = customFontLoaded ? "CustomFont" : "Arial, sans-serif";
  return `${weight} ${size}px ${family}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("User to view")
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const user = interaction.options.getUser("user") || interaction.user;
    const userId = user.id;

    // ---- GLOBAL ECONOMY KEYS ----
    const balance = Number(await redis.get(`eco:${userId}:money`) || 0);
    const shield = Number(await redis.get(`eco:${userId}:shield`) || 0);
    
    // ---- PREMIUM CHECK (from redeem codes) ----
    const premiumValue = await redis.get(`premium:user:${userId}`);
    const isPremium = premiumValue !== null; // "active", "perm", or any value

    // ---- PROFILE DATA ----
    const profile = await redis.hgetall(`profile:${userId}`) || {};
    const level = Number(profile.level || 1);
    const xp = Number(profile.xp || 0);
    const bio = profile.bio || "No bio set";
    const color = profile.color || "#5865F2";
    const bg = profile.bg || null;
    const customBg = profile.custom_bg || null;

    // ---- XP PROGRESS ----
    const needed = Math.floor(100 * Math.pow(level, 1.6));
    const progress = Math.min(xp / needed, 1);

    // ---- CANVAS ----
    const canvas = createCanvas(900, 350);
    const ctx = canvas.getContext("2d");

    // Background
    let bgImage = null;
    if (customBg) {
      try { bgImage = await loadImage(customBg); } catch {}
    }
    if (!bgImage && bg) {
      const shopData = await redis.hgetall(`shop:bg:${bg}`);
      if (shopData?.url) {
        try { bgImage = await loadImage(shopData.url); } catch {}
      }
    }
    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, 900, 350);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 900, 350);
      gradient.addColorStop(0, color + "33");
      gradient.addColorStop(1, "#2C3E50");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 900, 350);
    }

    // Overlay
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, 900, 350);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0, 0, 900, 350);

    // Avatar
    const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 20;
    ctx.save();
    ctx.beginPath();
    ctx.arc(130, 145, 80, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 45, 65, 170, 170);
    ctx.restore();

    // Avatar ring
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(130, 145, 85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ---- TEXT ----
    ctx.fillStyle = "#FFFFFF";
    ctx.font = getFont("bold", 32);
    ctx.fillText(user.username, 270, 100);

    // Title based on premium
    let title = "Member";
    if (isPremium) title = "Premium";
    if (userId === "1303357369622990889") title = "Developer";

    ctx.fillStyle = color;
    ctx.font = getFont("bold", 18);
    ctx.fillText(title, 270, 140);

    // Bio
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = getFont("normal", 16);
    let displayBio = bio;
    if (displayBio.length > 60) displayBio = displayBio.substring(0, 57) + "...";
    ctx.fillText(displayBio, 270, 175);

    // Stats (clean labels)
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = getFont("bold", 16);
    let xPos = 270;
    const stats = [
      { label: "Coins:", value: balance },
      { label: "Shields:", value: shield },
      { label: "Level:", value: level }
    ];
    stats.forEach((stat, index) => {
      if (index > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = getFont("normal", 16);
        ctx.fillText("|", xPos + 20, 205);
        xPos += 40;
      }
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = getFont("bold", 16);
      ctx.fillText(stat.label, xPos, 205);
      xPos += 70;
      ctx.font = getFont("normal", 16);
      ctx.fillStyle = color;
      ctx.fillText(stat.value, xPos, 205);
      xPos += 80;
    });

    // XP Bar
    const barX = 270, barY = 240, barWidth = 540, barHeight = 22;
    ctx.shadowBlur = 5;
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 11);
    ctx.fill();

    const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "#FF6B6B");
    ctx.fillStyle = gradient;
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth * progress, barHeight, 11);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = getFont("bold", 14);
    ctx.textAlign = "center";
    ctx.fillText(`${xp}/${needed} XP`, barX + barWidth / 2, barY + 17);

    // Level badge
    ctx.textAlign = "center";
    const levelX = 780, levelY = 80;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.arc(levelX, levelY, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(levelX, levelY, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = getFont("bold", 18);
    ctx.fillText("LEVEL", levelX, levelY - 12);
    ctx.fillStyle = color;
    ctx.font = getFont("bold", 28);
    ctx.fillText(level, levelX, levelY + 22);

    // Footer
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = getFont("normal", 12);
    ctx.fillText(`ID: ${user.id.slice(0, 8)}...`, 20, 340);
    ctx.textAlign = "right";
    ctx.fillText("Profile v2.0", 880, 340);

    const buffer = canvas.toBuffer("image/png");

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${user.username}'s Profile`)
      .setDescription(`Level ${level} • ${title}`)
      .addFields(
        { name: "Coins", value: `${balance}`, inline: true },
        { name: "Shields", value: `${shield}`, inline: true },
        { name: "Progress", value: `${Math.round(progress * 100)}% to next level`, inline: true }
      )
      .setImage("attachment://profile.png")
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    return interaction.editReply({
      embeds: [embed],
      files: [new AttachmentBuilder(buffer, { name: "profile.png" })]
    });
  }
};

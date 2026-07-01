// utils/animatedProfile.js – Fully animated GIF generation (omggif)
const { createCanvas, loadImage, registerFont } = require("canvas");
const GIFEncoder = require("gif-encoder-2");
const omggif = require("omggif");
const path = require("path");
const fs = require("fs");
const { formatNumber } = require("../utils.js");

// ---------- FONT SETUP ----------
const fontPath = path.join(__dirname, "../font.ttf");
let customFontLoaded = false;
try {
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family: "CustomFont" });
    customFontLoaded = true;
  }
} catch {}

function getFont(weight = "normal", size = 16) {
  const family = customFontLoaded ? "CustomFont" : "Arial, sans-serif";
  const emojiFallback = ", 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'EmojiOne Color', sans-serif";
  return `${weight} ${size}px ${family}${emojiFallback}`;
}

// ---------- roundRect polyfill ----------
const { CanvasRenderingContext2D } = require("canvas");
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    return this;
  };
}

async function generateAnimatedProfile(gifUrl, data) {
  const W = 900, H = 350;

  // 1️⃣ Fetch the GIF
  const response = await fetch(gifUrl);
  if (!response.ok) throw new Error(`Failed to fetch GIF: ${response.status}`);
  const gifBuffer = Buffer.from(await response.arrayBuffer());

  // 2️⃣ Parse frames with omggif
  const reader = new omggif.GifReader(gifBuffer);
  const frameCount = reader.numFrames();
  if (frameCount === 0) throw new Error("GIF has no frames.");

  console.log(`[ANIMATED] Found ${frameCount} frames in GIF`);

  // 3️⃣ Extract each frame as a canvas buffer
  const frames = [];
  for (let i = 0; i < Math.min(frameCount, 30); i++) {
    const info = reader.frameInfo(i);

    // Decode frame onto a temporary canvas
    const tempCanvas = createCanvas(reader.width, reader.height);
    const tempCtx = tempCanvas.getContext("2d");
    const imageData = tempCtx.createImageData(reader.width, reader.height);
    reader.decodeAndBlitFrameRGBA(i, imageData.data);
    tempCtx.putImageData(imageData, 0, 0);

    // Scale to profile dimensions
    const frameCanvas = createCanvas(W, H);
    const ctx = frameCanvas.getContext("2d");
    ctx.drawImage(tempCanvas, 0, 0, W, H);

    const delay = info.delay ? info.delay * 10 : 100; // ms
    frames.push({ buffer: frameCanvas.toBuffer("image/png"), delay });
  }

  // 4️⃣ Preload avatar
  const avatarImg = await loadImage(data.avatarUrl);

  // 5️⃣ Profile overlay drawing function (same as static)
  async function drawProfileOverlay(ctx) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0, 0, W, H);

    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 20;
    ctx.save();
    ctx.beginPath();
    ctx.arc(130, 145, 80, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, 45, 65, 170, 170);
    ctx.restore();

    ctx.shadowColor = data.color;
    ctx.shadowBlur = 30;
    ctx.strokeStyle = data.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(130, 145, 85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (data.status) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = getFont("italic", 14);
      ctx.textAlign = "center";
      ctx.fillText(`"${data.status}"`, 130, 250);
      ctx.textAlign = "left";
    }

    const nameColorHex = data.nameColor || "#FFFFFF";
    ctx.fillStyle = nameColorHex;
    ctx.font = getFont("bold", 32);
    const nameWidth = ctx.measureText(data.username).width;
    ctx.fillText(data.username, 270, 100);
    if (data.premium) {
      ctx.fillStyle = "#FFD700";
      ctx.font = getFont("bold", 18);
      ctx.fillText("PREMIUM", 270 + nameWidth + 15, 100);
    }

    let title = "Member";
    if (data.premium) title = "PREMIUM";
    else if (data.beta) title = "Beta Tester";
    ctx.fillStyle = data.color;
    ctx.font = getFont("bold", 18);
    ctx.fillText(title, 270, 140);

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = getFont("normal", 16);
    let displayBio = data.bio;
    if (displayBio.length > 60) displayBio = displayBio.substring(0, 57) + "...";
    ctx.fillText(displayBio, 270, 175);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = getFont("bold", 16);
    let xPos = 270;
    const stats = [
      { label: "Coins:", value: formatNumber(data.balance) },
      { label: "Reputation:", value: formatNumber(data.reputation) },
      { label: "Level:", value: data.level }
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
      xPos += 100;
      ctx.font = getFont("normal", 16);
      ctx.fillStyle = data.color;
      ctx.fillText(stat.value, xPos,

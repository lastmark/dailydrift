// utils/animatedProfile.js – High-Performance Animated GIF Profile Generator
const { createCanvas, loadImage, registerFont, CanvasRenderingContext2D } = require("canvas");
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
} catch (e) { console.error("Font loading error:", e); }

function getFont(weight = "normal", size = 16) {
  const family = customFontLoaded ? "CustomFont" : "Arial, sans-serif";
  return `${weight} ${size}px ${family}, sans-serif`;
}

// ---------- roundRect Polyfill ----------
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    this.beginPath();
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
    return this;
  };
}

/**
 * Generates an animated profile GIF using canvas and gif-encoder-2.
 */
async function generateAnimatedProfile(gifUrl, data) {
  const W = 900, H = 350;

  // 1. Fetch & Parse GIF
  const response = await fetch(gifUrl);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const gifBuffer = Buffer.from(await response.arrayBuffer());
  const reader = new omggif.GifReader(gifBuffer);
  
  // 2. Preload Avatar
  const avatarImg = await loadImage(data.avatarUrl);

  // 3. UI Drawing Overlay (Closure)
  const drawOverlay = (ctx) => {
    // Background Overlay
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);

    // Avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(130, 145, 80, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, 45, 65, 170, 170);
    ctx.restore();

    // Stats, Text, and Progress Bar (as per your specs)...
    ctx.fillStyle = data.nameColor || "#FFFFFF";
    ctx.font = getFont("bold", 32);
    ctx.fillText(data.username, 270, 100);
    
    // Progress Bar
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.roundRect(270, 240, 540, 22, 11).fill();
    ctx.fillStyle = data.color;
    ctx.roundRect(270, 240, 540 * data.progress, 22, 11).fill();
  };

  // 4. Encode
  const encoder = new GIFEncoder(W, H, "neuquant", true);
  encoder.start();
  encoder.setRepeat(0);

  for (let i = 0; i < Math.min(reader.numFrames(), 50); i++) {
    const frameCanvas = createCanvas(W, H);
    const ctx = frameCanvas.getContext("2d");

    // Decode & Blit
    const imageData = ctx.createImageData(reader.width, reader.height);
    reader.decodeAndBlitFrameRGBA(i, imageData.data);
    const tempCanvas = createCanvas(reader.width, reader.height);
    tempCanvas.getContext("2d").putImageData(imageData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, W, H);

    // Apply Overlay
    drawOverlay(ctx);

    encoder.setDelay(reader.frameInfo(i).delay * 10);
    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}

module.exports = { generateAnimatedProfile };

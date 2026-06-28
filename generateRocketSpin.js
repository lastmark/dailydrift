// generateRocketSpin.js – Creates an animated rocket GIF
const { createCanvas } = require("canvas");
const GIFEncoder = require("gif-encoder-2");
const fs = require("fs");

const W = 64, H = 64, DELAY = 80, CYCLES = 3;

async function main() {
  const encoder = new GIFEncoder(W, H, "neuquant", true);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(DELAY);
  encoder.setQuality(10);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Rocket animation: move the rocket emoji up and down slightly
  const positions = [0, -2, -4, -2, 0, 2, 4, 2]; // slight bounce
  for (let cycle = 0; cycle < CYCLES; cycle++) {
    for (const dy of positions) {
      ctx.fillStyle = "#1a1a2e"; // dark background
      ctx.fillRect(0, 0, W, H);
      ctx.font = "40px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🚀", W / 2, H / 2 + 12 + dy);
      encoder.addFrame(ctx);
    }
  }

  encoder.finish();
  fs.writeFileSync("rocket_fly.gif", encoder.out.getData());
  console.log("✅ rocket_fly.gif created! Upload it as an emoji named 'rocket_fly'.");
}

main().catch(console.error);

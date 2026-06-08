const { createCanvas } = require("canvas");

function wordImage(word) {
  const canvas = createCanvas(500, 200);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, 500, 200);

  ctx.fillStyle = "white";
  ctx.font = "40px sans-serif";

  // partially hidden style
  const scrambled = word.split("").sort(() => Math.random() - 0.5).join(" ");
  ctx.fillText(scrambled, 50, 100);

  return canvas.toBuffer();
}

module.exports = { wordImage };

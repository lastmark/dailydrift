const { wordImage } = require("../canvas/word");

const words = ["dragon", "shadow", "nebula", "phantom", "quantum"];

let active = null;

async function startWordGame(channel) {
  const word = words[Math.floor(Math.random() * words.length)];
  active = word;

  const img = wordImage(word);

  channel.send({
    content: "Guess the word first!",
    files: [{ attachment: img, name: "word.png" }]
  });
}

function checkWord(message) {
  if (!active) return false;

  if (message.content.toLowerCase() === active) {
    active = null;
    message.reply("Winner!");
    return true;
  }
}

module.exports = { startWordGame, checkWord };

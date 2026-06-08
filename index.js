const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const { createCanvas, loadImage } = require("@napi-rs/canvas");
const sqlite3 = require("sqlite3").verbose();

/* ---------------- ICONS ---------------- */
const ICONS = {
    bot: "<:bot:1513533291385458708>",
    error: "<:error:1513532700202631240>",
    message: "<:message:1513533207037874196>",
    setting: "<:setting:1513533096740257993>",
    search: "<:search:1513533580087787530>",
    coin: "<:coin_flip:1513532556140744856>",
    memberAdd: "<:memberadd:1513532586998239335>",
    memberLeave: "<:memberleave:1513532632992845965>",
    user: "<:user:1513533036472307814>",
    announce: "<:announcement:1513533499607351356>",
    rock: "<:rock:1513532823301259446>",
    paper: "<:paper:1513532786445783151>",
    scissor: "<:scissor:1513532752669053090>"
};

/* ---------------- CONFIG ---------------- */
const config = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    devId: "1303357369622990889"
};

if (!config.token || !config.clientId) {
    console.log("❌ Missing DISCORD_TOKEN or CLIENT_ID");
    process.exit(1);
}

/* ---------------- CLIENT ---------------- */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

/* ---------------- DB ---------------- */
const db = new sqlite3.Database("./data.db");

db.run(`CREATE TABLE IF NOT EXISTS settings (
  guildId TEXT PRIMARY KEY,
  welcomeChannel TEXT,
  leaveChannel TEXT,
  welcomeMsg TEXT,
  leaveMsg TEXT
)`);

function set(guildId, key, value) {
    db.run(
        `INSERT INTO settings (guildId, ${key})
         VALUES (?, ?)
         ON CONFLICT(guildId) DO UPDATE SET ${key}=excluded.${key}`,
        [guildId, value]
    );
}

function get(guildId) {
    return new Promise(res => {
        db.get(`SELECT * FROM settings WHERE guildId=?`, [guildId], (_, row) => {
            res(row);
        });
    });
}

/* ---------------- GAME STATE ---------------- */
const counting = new Map();
const wordGame = new Map();

/* ---------------- WORD GAME ---------------- */
function randomWord() {
    const words = ["apple", "dragon", "system", "matrix", "rocket", "shadow"];
    return words[Math.floor(Math.random() * words.length)];
}

function wordImage(word) {
    const canvas = createCanvas(400, 200);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 400, 200);

    ctx.fillStyle = "#fff";
    ctx.font = "40px sans-serif";

    const hidden = word
        .split("")
        .map(c => (Math.random() > 0.5 ? "_" : c))
        .join("");

    ctx.fillText(hidden, 60, 100);

    return canvas.toBuffer("image/png");
}

/* ---------------- WELCOME IMAGE ---------------- */
async function welcomeCard(user, guild) {
   

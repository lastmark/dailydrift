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

if (!config.token) {
    console.log("❌ Missing DISCORD_TOKEN in environment variables");
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
    const canvas = createCanvas(700, 250);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, 700, 250);

    ctx.fillStyle = "#fff";
    ctx.font = "28px sans-serif";

    ctx.fillText("Welcome", 250, 110);
    ctx.fillText(user.username, 250, 150);
    ctx.fillText(guild.name, 250, 190);

    const avatar = await loadImage(
        user.displayAvatarURL({ extension: "png" })
    );

    ctx.drawImage(avatar, 30, 50, 150, 150);

    return canvas.toBuffer("image/png");
}

/* ---------------- SLASH COMMANDS ---------------- */
const commands = [
    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Configure welcome/leave system")
        .addStringOption(o =>
            o.setName("type")
                .setRequired(true)
                .addChoices(
                    { name: "welcome", value: "welcome" },
                    { name: "leave", value: "leave" }
                )
        )
        .addChannelOption(o =>
            o.setName("channel").setRequired(true)
        )
        .addStringOption(o =>
            o.setName("message").setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("rps")
        .setDescription("Rock Paper Scissors")
        .addStringOption(o =>
            o.setName("choice")
                .setRequired(true)
                .addChoices(
                    { name: "rock", value: "rock" },
                    { name: "paper", value: "paper" },
                    { name: "scissors", value: "scissors" }
                )
        ),

    new SlashCommandBuilder()
        .setName("word")
        .setDescription("Start word guessing game"),

    new SlashCommandBuilder()
        .setName("user")
        .setDescription("User info"),

    new SlashCommandBuilder()
        .setName("server")
        .setDescription("Server info"),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show all bot commands")
];

/* ---------------- REGISTER COMMANDS ---------------- */
const rest = new REST({ version: "10" }).setToken(config.token);

async function registerCommands() {
    await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands }
    );
}

/* ---------------- READY ---------------- */
client.once("ready", async () => {
    console.log(`${ICONS.bot} Logged in as ${client.user.tag}`);
    await registerCommands();
});

/* ---------------- WELCOME / LEAVE ---------------- */
client.on("guildMemberAdd", async member => {
    const data = await get(member.guild.id);
    if (!data?.welcomeChannel) return;

    const ch = member.guild.channels.cache.get(data.welcomeChannel);
    if (!ch) return;

    const img = await welcomeCard(member.user, member.guild);

    ch.send({
        content: data.welcomeMsg || `${ICONS.memberAdd} Welcome ${member.user.username}`,
        files: [{ attachment: img, name: "welcome.png" }]
    });
});

client.on("guildMemberRemove", async member => {
    const data = await get(member.guild.id);
    if (!data?.leaveChannel) return;

    const ch = member.guild.channels.cache.get(data.leaveChannel);
    if (!ch) return;

    ch.send({
        content: data.leaveMsg || `${ICONS.memberLeave} ${member.user.username} left`
    });
});

/* ---------------- INTERACTIONS ---------------- */
client.on("interactionCreate", async i => {
    if (!i.isChatInputCommand()) return;

    if (i.commandName === "setup") {
        const type = i.options.getString("type");
        const channel = i.options.getChannel("channel");
        const msg = i.options.getString("message") || "";

        if (type === "welcome") {
            set(i.guild.id, "welcomeChannel", channel.id);
            set(i.guild.id, "welcomeMsg", msg);
        } else {
            set(i.guild.id, "leaveChannel", channel.id);
            set(i.guild.id, "leaveMsg", msg);
        }

        return i.reply({
            content: `${ICONS.setting} Saved`,
            ephemeral: true
        });
    }

    if (i.commandName === "rps") {
        const user = i.options.getString("choice");
        const bot = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];

        const iconUser =
            user === "rock" ? ICONS.rock :
            user === "paper" ? ICONS.paper :
            ICONS.scissor;

        const iconBot =
            bot === "rock" ? ICONS.rock :
            bot === "paper" ? ICONS.paper :
            ICONS.scissor;

        const result =
            user === bot
                ? "Tie"
                : (user === "rock" && bot === "scissors") ||
                  (user === "paper" && bot === "rock") ||
                  (user === "scissors" && bot === "paper")
                ? "Win"
                : "Lose";

        return i.reply(`${iconUser} vs ${iconBot}\nResult: **${result}**`);
    }

    if (i.commandName === "word") {
        const word = randomWord();
        wordGame.set(i.guild.id, word);

        const img = wordImage(word);

        return i.reply({
            content: `${ICONS.search} First to guess wins`,
            files: [{ attachment: img, name: "word.png" }]
        });
    }

    if (i.commandName === "user") {
        return i.reply(`${ICONS.user} ${i.user.username}\nID: ${i.user.id}`);
    }

    if (i.commandName === "server") {
        return i.reply(`${ICONS.announce} ${i.guild.name}\nMembers: ${i.guild.memberCount}`);
    }

    if (i.commandName === "help") {
        return i.reply({
            embeds: [{
                color: 0x2b2d31,
                title: `${ICONS.bot} Help Menu`,
                description:
                    `**/setup** → configure welcome & leave\n` +
                    `**/rps** → rock paper scissors\n` +
                    `**/word** → word guessing game\n` +
                    `**/user** → user info\n` +
                    `**/server** → server info\n` +
                    `**/help** → show this menu`
            }],
            ephemeral: true
        });
    }
});

/* ---------------- MESSAGE GAMES ---------------- */
client.on("messageCreate", async message => {
    if (!message.guild || message.author.bot) return;

    if (!counting.has(message.guild.id)) {
        counting.set(message.guild.id, { num: 0, last: null });
    }

    const g = counting.get(message.guild.id);
    const n = parseInt(message.content);

    if (!isNaN(n)) {
        if (message.author.id === g.last) {
            g.num = 0;
            return message.react("❌");
        }

        if (n !== g.num + 1) {
            g.num = 0;
            g.last = null;
            return message.react("❌");
        }

        g.num++;
        g.last = message.author.id;
        return message.react("✅");
    }

    const word = wordGame.get(message.guild.id);
    if (word && message.content.toLowerCase() === word) {
        wordGame.delete(message.guild.id);
        message.reply(`${ICONS.coin} Winner: ${message.author.username}`);
    }
});

client.login(config.token);

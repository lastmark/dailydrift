const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();

/* ---------------- ICONS ---------------- */
const ICONS = {
    bot: "<:bot:1513533291385458708>",
    setting: "<:setting:1513533096740257993>",
    search: "<:search:1513533580087787530>",
    coin: "<:coin_flip:1513532556140744856>",
    memberAdd: "<:memberadd:1513532586998239335>",
    memberLeave: "<:memberleave:1513532632992845965>",
    user: "<:user:1513533036472307814>",
    announce: "<:announcement:1513533499607351356>"
};

/* ---------------- CONFIG ---------------- */
const config = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    devId: "1303357369622990889"
};

if (!config.token || !config.clientId) {
    console.log("Missing DISCORD_TOKEN or CLIENT_ID");
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
    leaveChannel TEXT
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

/* ---------------- SAFE COMMAND BUILDER ---------------- */
const cmd = (name, desc) =>
    new SlashCommandBuilder()
        .setName(name)
        .setDescription(typeof desc === "string" ? desc : "No description");

/* ---------------- COMMANDS ---------------- */
const commands = [
    cmd("setup", "Setup welcome/leave system")
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
        ),

    cmd("rps", "Rock Paper Scissors")
        .addStringOption(o =>
            o.setName("choice")
                .setRequired(true)
                .addChoices(
                    { name: "rock", value: "rock" },
                    { name: "paper", value: "paper" },
                    { name: "scissors", value: "scissors" }
                )
        ),

    cmd("word", "Word game"),
    cmd("user", "User info"),
    cmd("server", "Server info"),
    cmd("help", "Show commands")
];

/* ---------------- REGISTER COMMANDS ---------------- */
const rest = new REST({ version: "10" }).setToken(config.token);

async function registerCommands() {
    try {
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands.map(c => c.toJSON()) }
        );
        console.log("Commands registered");
    } catch (err) {
        console.log("Command error:", err);
    }
}

/* ---------------- READY ---------------- */
client.once("ready", async () => {
    console.log(`${ICONS.bot} Logged in as ${client.user.tag}`);
    await registerCommands();
});

/* ---------------- EVENTS ---------------- */
client.on("guildMemberAdd", async member => {
    const data = await get(member.guild.id);
    if (!data?.welcomeChannel) return;

    const ch = member.guild.channels.cache.get(data.welcomeChannel);
    if (!ch) return;

    ch.send(`${ICONS.memberAdd} Welcome ${member.user.username}`);
});

client.on("guildMemberRemove", async member => {
    const data = await get(member.guild.id);
    if (!data?.leaveChannel) return;

    const ch = member.guild.channels.cache.get(data.leaveChannel);
    if (!ch) return;

    ch.send(`${ICONS.memberLeave} ${member.user.username} left`);
});

/* ---------------- COMMAND HANDLER ---------------- */
client.on("interactionCreate", async i => {
    if (!i.isChatInputCommand()) return;

    if (i.commandName === "setup") {
        const type = i.options.getString("type");
        const channel = i.options.getChannel("channel");

        set(i.guild.id, type === "welcome" ? "welcomeChannel" : "leaveChannel", channel.id);

        return i.reply({ content: `${ICONS.setting} Saved`, ephemeral: true });
    }

    if (i.commandName === "rps") {
        const user = i.options.getString("choice");
        const bot = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];

        return i.reply(`You: ${user} | Bot: ${bot}`);
    }

    if (i.commandName === "word") {
        const word = ["apple", "dragon", "matrix", "rocket"][Math.floor(Math.random() * 4)];
        wordGame.set(i.guild.id, word);

        return i.reply(`${ICONS.search} Guess the word: ${word}`);
    }

    if (i.commandName === "user") {
        return i.reply(`${ICONS.user} ${i.user.username}`);
    }

    if (i.commandName === "server") {
        return i.reply(`${ICONS.announce} ${i.guild.name}`);
    }

    if (i.commandName === "help") {
        return i.reply(
            "**Commands:**\n" +
            "/setup\n/rps\n/word\n/user\n/server\n/help"
        );
    }
});

/* ---------------- MESSAGE GAMES ---------------- */
client.on("messageCreate", message => {
    if (!message.guild || message.author.bot) return;

    const n = parseInt(message.content);

    if (!isNaN(n)) {
        const g = counting.get(message.guild.id) || { num: 0, last: null };

        if (message.author.id === g.last) {
            g.num = 0;
            return message.react("❌");
        }

        if (n !== g.num + 1) {
            g.num = 0;
            return message.react("❌");
        }

        g.num++;
        g.last = message.author.id;

        counting.set(message.guild.id, g);
        return message.react("✅");
    }

    const word = wordGame.get(message.guild.id);
    if (word && message.content.toLowerCase() === word) {
        wordGame.delete(message.guild.id);
        message.reply(`${ICONS.coin} Winner ${message.author.username}`);
    }
});

/* ---------------- LOGIN ---------------- */
client.login(config.token);

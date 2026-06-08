const {
    Client, GatewayIntentBits, AttachmentBuilder, SlashCommandBuilder,
    REST, Routes, PermissionFlagsBits, ActivityType
} = require("discord.js");
const Canvas = require("canvas");
const path = require("path");

// ---------- REGISTER YOUR CUSTOM FONT ----------
const fontPath = path.join(__dirname, "font.ttf");
Canvas.registerFont(fontPath, { family: "CustomFont" });
console.log("✅ Custom font registered");

// ---------- CONFIGURATION ----------
const DEV_ID = "1303357369622990889";
const TEST_GUILD_ID = "1319429710094270554";   // your server ID

// ---------- CUSTOM ICONS ----------
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

// ---------- FUNNY ACTIVITIES (rotates every hour) ----------
const ACTIVITIES = [
    { name: "with a cheese grater", type: ActivityType.Playing },
    { name: "my users argue", type: ActivityType.Watching },
    { name: "to elevator music", type: ActivityType.Listening },
    { name: "why did the chicken cross the road", type: ActivityType.Competing },
    { name: "the Bee Movie script", type: ActivityType.Playing },
    { name: "how many licks to a Tootsie Pop", type: ActivityType.Watching }
];

// ---------- SIMPLE STORAGE (instead of Redis) ----------
const settings = new Map(); // keys: "guildId:welcome", "guildId:leave"

// ---------- CLIENT SETUP ----------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

// ---------- CANVAS CARD WITH CUSTOM FONT ----------
async function createCard(member, type) {
    const canvas = Canvas.createCanvas(600, 300);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#1A1D29";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Accent bar
    ctx.fillStyle = type === "welcome" ? "#00FF88" : "#FF4444";
    ctx.fillRect(0, 0, 10, canvas.height);

    // Avatar
    try {
        const avatar = await Canvas.loadImage(member.user.displayAvatarURL({ extension: "png", size: 128 }));
        ctx.drawImage(avatar, 50, 50, 100, 100);
    } catch (err) {
        console.error("Avatar load error:", err);
    }

    // Text with custom font (fallback to sans-serif)
    const fontFamily = "CustomFont, 'Segoe UI', Arial, sans-serif";
    ctx.font = `bold 32px ${fontFamily}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(type === "welcome" ? "WELCOME" : "GOODBYE", 180, 90);

    ctx.font = `24px ${fontFamily}`;
    ctx.fillStyle = "#CCCCCC";
    let username = member.user.username;
    if (username.length > 15) username = username.slice(0, 12) + "...";
    ctx.fillText(username, 180, 140);

    ctx.font = `18px ${fontFamily}`;
    ctx.fillStyle = "#888888";
    ctx.fillText(`Member #${member.guild.memberCount}`, 180, 180);

    return new AttachmentBuilder(canvas.toBuffer(), { name: `${type}.png` });
}

// ---------- COMMANDS (RAW OBJECTS - GUARANTEED VALID) ----------
const commands = [
    { name: "ping", description: "Test the bot" },
    { name: "eval", description: "Developer only", options: [{ type: 3, name: "code", description: "JavaScript code", required: true }] },
    { name: "purge", description: "Delete messages (Admin)", options: [{ type: 4, name: "amount", description: "1-100", required: true }] },
    { name: "activity", description: "Developer only", options: [{ type: 3, name: "text", description: "New status text", required: true }] },
    { name: "setwelcome", description: "Admin only", options: [{ type: 7, name: "channel", description: "Welcome channel", required: true }] },
    { name: "setleave", description: "Admin only", options: [{ type: 7, name: "channel", description: "Leave channel", required: true }] },
    { name: "config", description: "Show current welcome/leave channels" },
    { name: "rps", description: "Play Rock Paper Scissors", options: [{ type: 3, name: "choice", description: "Your choice", required: true, choices: [{ name: "Rock", value: "rock" }, { name: "Paper", value: "paper" }, { name: "Scissors", value: "scissor" }] }] },
    { name: "coinflip", description: "Flip a coin" },
    { name: "serverinfo", description: "Get server information" },
    { name: "userinfo", description: "Get user information", options: [{ type: 6, name: "user", description: "User to check", required: false }] },
    { name: "8ball", description: "Ask the magic 8ball", options: [{ type: 3, name: "question", description: "Ask anything", required: true }] },
    { name: "dice", description: "Roll a dice" }
];

// ---------- CLIENT READY (using clientReady event) ----------
client.once("clientReady", async () => {
    console.log(`${ICONS.bot} ${client.user.tag} is online`);

    const rest = new REST({ version: "10" }).setToken(process.env.token);
    try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID), { body: commands });
        console.log(`${ICONS.announce} Registered ${commands.length} commands to guild ${TEST_GUILD_ID}`);
    } catch (err) {
        console.error(`${ICONS.error} Command registration failed:`, err);
    }

    // Start activity rotation (every hour)
    setInterval(() => {
        const act = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        client.user.setActivity(act.name, { type: act.type });
    }, 60 * 60 * 1000);
});

// ---------- COMMAND HANDLER (bulletproof, always replies) ----------
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user, guild, channel, member } = interaction;
    const isDev = user.id === DEV_ID;
    const isAdmin = member?.permissions.has(PermissionFlagsBits.Administrator) || false;

    console.log(`📥 Command: ${commandName} by ${user.tag} (Dev:${isDev} Admin:${isAdmin})`);

    // Helper that always replies within 3 seconds
    const reply = (content, ephemeral = false) => interaction.reply({ content, ephemeral });
    const deferAndReply = async (content, ephemeral = true) => {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral });
        return interaction.editReply(content);
    };

    try {
        switch (commandName) {
            case "ping":
                return reply(`🏓 Pong! ${Date.now() - interaction.createdTimestamp}ms`);

            case "coinflip":
                return reply(`${ICONS.coin} ${Math.random() < 0.5 ? "Heads" : "Tails"}`);

            case "dice":
                return reply(`${ICONS.coin} You rolled **${Math.floor(Math.random() * 6) + 1}**`);

            case "serverinfo":
                return reply({
                    embeds: [{
                        title: `${ICONS.search} ${guild.name}`,
                        fields: [
                            { name: `${ICONS.user} Members`, value: `${guild.memberCount}`, inline: true },
                            { name: `${ICONS.announce} Created`, value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                            { name: `${ICONS.bot} Owner`, value: `<@${guild.ownerId}>`, inline: true }
                        ],
                        thumbnail: { url: guild.iconURL() }
                    }]
                });

            case "userinfo": {
                const target = options.getUser("user") || user;
                const memberTarget = guild.members.cache.get(target.id);
                return reply({
                    embeds: [{
                        title: `${ICONS.user} ${target.username}`,
                        fields: [
                            { name: "ID", value: target.id, inline: true },
                            { name: "Joined Server", value: memberTarget ? `<t:${Math.floor(memberTarget.joinedTimestamp / 1000)}:R>` : "Unknown", inline: true },
                            { name: "Bot", value: target.bot ? "Yes" : "No", inline: true }
                        ],
                        thumbnail: { url: target.displayAvatarURL() }
                    }]
                });
            }

            case "8ball": {
                const question = options.getString("question");
                const answers = ["Definitely", "No way", "Ask later", "Yes", "Don't count on it", "Outlook good", "Very doubtful", "Without a doubt"];
                const answer = answers[Math.floor(Math.random() * answers.length)];
                return reply(`${ICONS.coin} **Question:** ${question}\n**Answer:** ${answer}`);
            }

            case "rps": {
                const choice = options.getString("choice");
                const botChoice = ["rock", "paper", "scissor"][Math.floor(Math.random() * 3)];
                const emojis = { rock: ICONS.rock, paper: ICONS.paper, scissor: ICONS.scissor };
                let result = "";
                if (choice === botChoice) result = "It's a tie!";
                else if ((choice === "rock" && botChoice === "scissor") ||
                         (choice === "paper" && botChoice === "rock") ||
                         (choice === "scissor" && botChoice === "paper")) result = "You win!";
                else result = "I win!";
                return reply(`${ICONS.coin} You: ${emojis[choice]} | Me: ${emojis[botChoice]}\n${result}`);
            }

            // ---------- ADMIN COMMANDS ----------
            case "purge": {
                if (!isAdmin) return reply(`${ICONS.error} Admin only`, true);
                const amount = options.getInteger("amount");
                if (amount < 1 || amount > 100) return reply("Amount must be between 1 and 100", true);
                await interaction.deferReply({ ephemeral: true });
                const deleted = await channel.bulkDelete(amount, true);
                return interaction.editReply(`${ICONS.message} Deleted ${deleted.size} messages`);
            }

            case "setwelcome": {
                if (!isAdmin) return reply(`${ICONS.error} Admin only`, true);
                const channelOpt = options.getChannel("channel");
                settings.set(`${guild.id}:welcome`, channelOpt.id);
                return reply(`${ICONS.setting} Welcome channel set to ${channelOpt}`);
            }

            case "setleave": {
                if (!isAdmin) return reply(`${ICONS.error} Admin only`, true);
                const channelOpt = options.getChannel("channel");
                settings.set(`${guild.id}:leave`, channelOpt.id);
                return reply(`${ICONS.setting} Leave channel set to ${channelOpt}`);
            }

            case "config": {
                const welcome = settings.get(`${guild.id}:welcome`);
                const leave = settings.get(`${guild.id}:leave`);
                return reply(`**Welcome Channel:** ${welcome ? `<#${welcome}>` : "Not set"}\n**Leave Channel:** ${leave ? `<#${leave}>` : "Not set"}`);
            }

            // ---------- DEVELOPER COMMANDS ----------
            case "eval": {
                if (!isDev) return reply(`${ICONS.error} Developer only`, true);
                const code = options.getString("code");
                try {
                    let result = eval(code);
                    if (typeof result !== "string") result = require("util").inspect(result);
                    if (result.length > 1900) result = result.slice(0, 1900);
                    return reply(`\`\`\`js\n${result}\n\`\`\``, true);
                } catch (err) {
                    return reply(`\`\`\`js\n${err.message}\n\`\`\``, true);
                }
            }

            case "activity": {
                if (!isDev) return reply(`${ICONS.error} Developer only`, true);
                const text = options.getString("text");
                client.user.setActivity(text);
                return reply(`${ICONS.setting} Bot status changed to: ${text}`);
            }

            default:
                return reply(`${ICONS.error} Unknown command`, true);
        }
    } catch (err) {
        console.error("Command error:", err);
        const errorMsg = interaction.deferred || interaction.replied ? "editReply" : "reply";
        await interaction[errorMsg]({ content: `${ICONS.error} Something went wrong: ${err.message}`, ephemeral: true });
    }
});

// ---------- WELCOME / LEAVE CARDS ----------
client.on("guildMemberAdd", async member => {
    const welcomeId = settings.get(`${member.guild.id}:welcome`);
    if (welcomeId) {
        const channel = member.guild.channels.cache.get(welcomeId);
        if (channel) {
            const card = await createCard(member, "welcome");
            await channel.send({ content: `${ICONS.memberAdd} Welcome ${member.user.username}!`, files: [card] });
        }
    }
});

client.on("guildMemberRemove", async member => {
    const leaveId = settings.get(`${member.guild.id}:leave`);
    if (leaveId) {
        const channel = member.guild.channels.cache.get(leaveId);
        if (channel) {
            const card = await createCard(member, "leave");
            await channel.send({ content: `${ICONS.memberLeave} ${member.user.username} left`, files: [card] });
        }
    }
});

// ---------- LOGIN ----------
client.login(process.env.token);

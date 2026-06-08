const {
    Client, GatewayIntentBits, AttachmentBuilder, SlashCommandBuilder,
    REST, Routes, PermissionFlagsBits, ActivityType
} = require("discord.js");
const Canvas = require("canvas");
const path = require("path");

// ---------- REGISTER YOUR CUSTOM FONT ----------
// Place your font file (e.g., "font.ttf") in the same folder as this script
const fontPath = path.join(__dirname, "font.ttf"); // Change to "font.tff" if that's the exact name
Canvas.registerFont(fontPath, { family: "CustomFont" });
console.log("✅ Custom font registered");

// ---------- YOUR DEV ID ----------
const DEV_ID = "1303357369622990889";

// ---------- ICONS ----------
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

// ---------- FUNNY ACTIVITIES ----------
const ACTIVITIES = [
    { name: "with a cheese grater", type: ActivityType.Playing },
    { name: "my users argue", type: ActivityType.Watching },
    { name: "to elevator music", type: ActivityType.Listening },
    { name: "why did the chicken cross the road", type: ActivityType.Competing },
    { name: "the Bee Movie script", type: ActivityType.Playing }
];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

// ---------- CANVAS CARD WITH YOUR CUSTOM FONT ----------
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

    // Text with your custom font (fallback to Arial if missing)
    const fontFamily = "CustomFont, Arial, sans-serif";
    ctx.font = `bold 32px ${fontFamily}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(type === "welcome" ? "WELCOME" : "GOODBYE", 180, 90);

    ctx.font = `24px ${fontFamily}`;
    ctx.fillStyle = "#CCCCCC";
    ctx.fillText(member.user.username, 180, 140);

    ctx.font = `18px ${fontFamily}`;
    ctx.fillStyle = "#888888";
    ctx.fillText(`Member #${member.guild.memberCount}`, 180, 180);

    return new AttachmentBuilder(canvas.toBuffer(), { name: `${type}.png` });
}

// ---------- COMMANDS (Guild-specific for instant update) ----------
const commands = [
    new SlashCommandBuilder().setName("ping").setDescription("Test the bot"),
    new SlashCommandBuilder().setName("purge")
        .addIntegerOption(opt => opt.setName("amount").setDescription("1-100").setRequired(true))
        .setDescription("Delete messages (Admin)"),
    new SlashCommandBuilder().setName("eval")
        .addStringOption(opt => opt.setName("code").setDescription("JS code").setRequired(true))
        .setDescription("Developer only"),
    new SlashCommandBuilder().setName("activity")
        .addStringOption(opt => opt.setName("text").setDescription("New status").setRequired(true))
        .setDescription("Developer only"),
    new SlashCommandBuilder().setName("setwelcome")
        .addChannelOption(opt => opt.setName("channel").setDescription("Welcome channel").setRequired(true))
        .setDescription("Admin only"),
    new SlashCommandBuilder().setName("setleave")
        .addChannelOption(opt => opt.setName("channel").setDescription("Leave channel").setRequired(true))
        .setDescription("Admin only"),
    new SlashCommandBuilder().setName("config").setDescription("Show current settings"),
    new SlashCommandBuilder().setName("rps")
        .addStringOption(opt => opt.setName("choice").setRequired(true)
            .addChoices({ name: "Rock", value: "rock" }, { name: "Paper", value: "paper" }, { name: "Scissors", value: "scissor" }))
        .setDescription("Play Rock Paper Scissors"),
    new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin"),
    new SlashCommandBuilder().setName("serverinfo").setDescription("Server info"),
    new SlashCommandBuilder().setName("userinfo")
        .addUserOption(opt => opt.setName("user").setDescription("User to check"))
        .setDescription("User info"),
    new SlashCommandBuilder().setName("8ball")
        .addStringOption(opt => opt.setName("question").setDescription("Ask anything").setRequired(true))
        .setDescription("Magic 8ball"),
    new SlashCommandBuilder().setName("dice").setDescription("Roll a dice")
];

// ---------- SIMPLE STORAGE (no Redis needed) ----------
const settings = new Map(); // key: "guildId:welcome" or "guildId:leave"

// ---------- READY EVENT ----------
client.once("ready", async () => {
    console.log(`${ICONS.bot} ${client.user.tag} is online`);

    // Replace with your actual test server ID for instant commands
    const TEST_GUILD_ID = "YOUR_GUILD_ID_HERE"; // <-- CHANGE THIS
    const rest = new REST({ version: "10" }).setToken(process.env.token);

    try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID), {
            body: commands.map(cmd => cmd.toJSON())
        });
        console.log(`${ICONS.announce} Commands registered to guild ${TEST_GUILD_ID}`);
    } catch (err) {
        console.error(`${ICONS.error} Command registration failed:`, err);
    }

    // Activity rotation
    setInterval(() => {
        const act = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        client.user.setActivity(act.name, { type: act.type });
    }, 60 * 60 * 1000);
});

// ---------- INTERACTION HANDLER ----------
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user, guild, channel, member } = interaction;
    const isDev = user.id === DEV_ID;
    const isAdmin = member?.permissions.has(PermissionFlagsBits.Administrator) || false;

    console.log(`Command: ${commandName} by ${user.tag} (Dev:${isDev} Admin:${isAdmin})`);

    try {
        // --- PUBLIC COMMANDS ---
        if (commandName === "ping") {
            return interaction.reply(`${ICONS.bot} Pong! ${Date.now() - interaction.createdTimestamp}ms`);
        }

        if (commandName === "coinflip") {
            const result = Math.random() < 0.5 ? "Heads" : "Tails";
            return interaction.reply(`${ICONS.coin} ${result}`);
        }

        if (commandName === "serverinfo") {
            return interaction.reply({
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
        }

        if (commandName === "userinfo") {
            const target = options.getUser("user") || user;
            const memberTarget = guild.members.cache.get(target.id);
            return interaction.reply({
                embeds: [{
                    title: `${ICONS.user} ${target.username}`,
                    fields: [
                        { name: "ID", value: target.id, inline: true },
                        { name: "Joined", value: memberTarget ? `<t:${Math.floor(memberTarget.joinedTimestamp / 1000)}:R>` : "Unknown", inline: true },
                        { name: "Bot", value: target.bot ? "Yes" : "No", inline: true }
                    ],
                    thumbnail: { url: target.displayAvatarURL() }
                }]
            });
        }

        if (commandName === "8ball") {
            const question = options.getString("question");
            const answers = ["Definitely", "No way", "Ask later", "Yes", "Don't count on it", "Outlook good", "Very doubtful", "Without a doubt"];
            const answer = answers[Math.floor(Math.random() * answers.length)];
            return interaction.reply(`${ICONS.coin} ${question}\n🎱 ${answer}`);
        }

        if (commandName === "dice") {
            const roll = Math.floor(Math.random() * 6) + 1;
            return interaction.reply(`${ICONS.coin} You rolled **${roll}**`);
        }

        if (commandName === "rps") {
            const choice = options.getString("choice");
            const botChoice = ["rock", "paper", "scissor"][Math.floor(Math.random() * 3)];
            const emojis = { rock: ICONS.rock, paper: ICONS.paper, scissor: ICONS.scissor };
            let result = "";
            if (choice === botChoice) result = "Tie";
            else if ((choice === "rock" && botChoice === "scissor") ||
                     (choice === "paper" && botChoice === "rock") ||
                     (choice === "scissor" && botChoice === "paper")) result = "You win";
            else result = "I win";
            return interaction.reply(`${ICONS.coin} You: ${emojis[choice]} | Me: ${emojis[botChoice]}\n${result}`);
        }

        // --- ADMIN COMMANDS ---
        if (commandName === "purge") {
            if (!isAdmin) return interaction.reply({ content: `${ICONS.error} Admin only`, ephemeral: true });
            const amount = options.getInteger("amount");
            if (amount < 1 || amount > 100) return interaction.reply({ content: "1-100 only", ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            const deleted = await channel.bulkDelete(amount, true);
            return interaction.editReply(`${ICONS.message} Deleted ${deleted.size} messages`);
        }

        if (commandName === "setwelcome") {
            if (!isAdmin) return interaction.reply({ content: `${ICONS.error} Admin only`, ephemeral: true });
            const channel = options.getChannel("channel");
            settings.set(`${guild.id}:welcome`, channel.id);
            return interaction.reply(`${ICONS.setting} Welcome channel set to ${channel}`);
        }

        if (commandName === "setleave") {
            if (!isAdmin) return interaction.reply({ content: `${ICONS.error} Admin only`, ephemeral: true });
            const channel = options.getChannel("channel");
            settings.set(`${guild.id}:leave`, channel.id);
            return interaction.reply(`${ICONS.setting} Leave channel set to ${channel}`);
        }

        if (commandName === "config") {
            const welcome = settings.get(`${guild.id}:welcome`);
            const leave = settings.get(`${guild.id}:leave`);
            return interaction.reply({
                embeds: [{
                    title: `${ICONS.setting} Configuration`,
                    fields: [
                        { name: "Welcome Channel", value: welcome ? `<#${welcome}>` : "Not set", inline: true },
                        { name: "Leave Channel", value: leave ? `<#${leave}>` : "Not set", inline: true }
                    ]
                }]
            });
        }

        // --- DEV COMMANDS ---
        if (commandName === "eval") {
            if (!isDev) return interaction.reply({ content: `${ICONS.error} Dev only`, ephemeral: true });
            const code = options.getString("code");
            try {
                let result = eval(code);
                if (typeof result !== "string") result = require("util").inspect(result);
                if (result.length > 1900) result = result.slice(0, 1900);
                await interaction.reply({ content: `\`\`\`js\n${result}\n\`\`\``, ephemeral: true });
            } catch (err) {
                await interaction.reply({ content: `\`\`\`js\n${err.message}\n\`\`\``, ephemeral: true });
            }
        }

        if (commandName === "activity") {
            if (!isDev) return interaction.reply({ content: `${ICONS.error} Dev only`, ephemeral: true });
            const text = options.getString("text");
            client.user.setActivity(text);
            await interaction.reply(`${ICONS.setting} Status changed to: ${text}`);
        }

    } catch (err) {
        console.error(err);
        const replyMethod = interaction.deferred || interaction.replied ? "editReply" : "reply";
        await interaction[replyMethod]({ content: `${ICONS.error} ${err.message}`, ephemeral: true });
    }
});

// ---------- WELCOME / LEAVE EVENTS ----------
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

client.login(process.env.token);

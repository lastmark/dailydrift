const {
    Client,
    GatewayIntentBits,
    AttachmentBuilder,
    SlashCommandBuilder,
    REST,
    Routes,
    PermissionFlagsBits,
    ActivityType
} = require("discord.js");

const Canvas = require("canvas");
const { createClient } = require("redis");

// --- ICON DICTIONARY ---
const ICONS = {
    announce: "<:announcement:1513533499607351356>", bot: "<:bot:1513533291385458708>",
    coin: "<:coin_flip:1513532556140744856>", error: "<:error:1513532700202631240>",
    memberAdd: "<:memberadd:1513532586998239335>", memberLeave: "<:memberleave:1513532632992845965>",
    message: "<:message:1513533207037874196>", money: "<:money:1513532519599964270>",
    paper: "<:paper:1513532786445783151>", rock: "<:rock:1513532823301259446>",
    scissor: "<:scissor:1513532752669053090>", search: "<:search:1513533580087787530>",
    setting: "<:setting:1513533096740257993>", user: "<:user:1513533036472307814>"
};

// --- DEV CONFIG ---
const DEV_ID = "1303357369622990889";

// --- FUNNY ACTIVITIES ---
const FUNNY_ACTIVITIES = [
    { name: "with a cheese grater", type: ActivityType.Playing },
    { name: "my users argue", type: ActivityType.Watching },
    { name: "to elevator music", type: ActivityType.Listening },
    { name: "why did the chicken cross the road", type: ActivityType.Competing },
    { name: "the entire Bee Movie script", type: ActivityType.Playing },
    { name: "how many licks to a Tootsie Pop", type: ActivityType.Watching },
    { name: "absolute silence", type: ActivityType.Listening },
    { name: "the discord TOS", type: ActivityType.Competing },
    { name: "with a rubber duck", type: ActivityType.Playing },
    { name: "quantum physics explained wrong", type: ActivityType.Watching },
    { name: "my bank account cry", type: ActivityType.Listening },
    { name: "in the soup eating competition", type: ActivityType.Competing }
];

// --- REDIS CLIENT ---
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', err => console.error('Redis Error:', err));
redisClient.on('connect', () => console.log('Redis connected'));

// --- FIXED CANVAS FUNCTION (NO FONT ERRORS) ---
async function createCard(member, type) {
    const canvas = Canvas.createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#1A1D29';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Accent bar
    ctx.fillStyle = type === 'welcome' ? '#00FF88' : '#FF4444';
    ctx.fillRect(0, 0, 10, canvas.height);
    
    // Avatar
    try {
        const avatar = await Canvas.loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.save();
        ctx.beginPath();
        ctx.arc(150, 200, 80, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 70, 120, 160, 160);
        ctx.restore();
        
        ctx.beginPath();
        ctx.arc(150, 200, 85, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 5;
        ctx.stroke();
    } catch (err) {
        console.error('Avatar load error:', err);
    }
    
    // Text with guaranteed working font
    ctx.font = 'bold 48px "Noto Sans", "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(type === 'welcome' ? 'Welcome!' : 'Goodbye!', 280, 150);
    
    ctx.font = '32px "Noto Sans", "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#AAAAAA';
    let username = member.user.username;
    if (username.length > 15) username = username.slice(0, 12) + '...';
    ctx.fillText(username, 280, 220);
    
    ctx.font = '24px "Noto Sans", "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText(`Member #${member.guild.memberCount}`, 280, 280);
    
    return new AttachmentBuilder(canvas.toBuffer(), { name: `${type}-card.png` });
}

// --- CLIENT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- ACTIVITY ROTATOR ---
function rotateActivity() {
    const randomActivity = FUNNY_ACTIVITIES[Math.floor(Math.random() * FUNNY_ACTIVITIES.length)];
    client.user.setActivity(randomActivity.name, { type: randomActivity.type });
    console.log(`Activity changed to: ${randomActivity.type} ${randomActivity.name}`);
}

// --- ALL COMMANDS (including dev) ---
const commands = [
    // Public commands
    new SlashCommandBuilder().setName("help").setDescription("Show all commands"),
    new SlashCommandBuilder().setName("configuration").setDescription("View server configuration"),
    new SlashCommandBuilder().setName("purge")
        .addIntegerOption(opt => opt.setName("amount").setDescription("Messages to delete").setRequired(true).setMinValue(1).setMaxValue(100))
        .setDescription("Delete messages (Admin)"),
    new SlashCommandBuilder().setName("rps")
        .addStringOption(opt => opt.setName("choice").setDescription("Your choice").setRequired(true).addChoices(
            { name: "Rock", value: "rock" }, { name: "Paper", value: "paper" }, { name: "Scissors", value: "scissor" }))
        .setDescription("Play Rock Paper Scissors"),
    new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin"),
    new SlashCommandBuilder().setName("serverinfo").setDescription("Get server information"),
    new SlashCommandBuilder().setName("userinfo").addUserOption(opt => opt.setName("user").setDescription("User to check")).setDescription("Get user information"),
    new SlashCommandBuilder().setName("setwelcomechannel")
        .addChannelOption(opt => opt.setName("channel").setDescription("Welcome channel").setRequired(true))
        .setDescription("Set welcome channel (Admin)"),
    new SlashCommandBuilder().setName("setleavechannel")
        .addChannelOption(opt => opt.setName("channel").setDescription("Leave channel").setRequired(true))
        .setDescription("Set leave channel (Admin)"),
    new SlashCommandBuilder().setName("8ball").addStringOption(opt => opt.setName("question").setDescription("Ask anything").setRequired(true)).setDescription("Ask the magic 8ball"),
    new SlashCommandBuilder().setName("dice").setDescription("Roll a dice"),
    
    // Developer commands (hidden from non-devs via check)
    new SlashCommandBuilder().setName("dev_eval").addStringOption(opt => opt.setName("code").setDescription("Code to evaluate").setRequired(true)).setDescription("Execute JavaScript code"),
    new SlashCommandBuilder().setName("dev_reload").setDescription("Reload bot commands"),
    new SlashCommandBuilder().setName("dev_guilds").setDescription("List all guilds the bot is in"),
    new SlashCommandBuilder().setName("dev_leave").addStringOption(opt => opt.setName("guildid").setDescription("Guild ID to leave").setRequired(true)).setDescription("Force bot to leave a guild"),
    new SlashCommandBuilder().setName("dev_activity").addStringOption(opt => opt.setName("activity").setDescription("New activity").setRequired(true)).setDescription("Change bot activity"),
    new SlashCommandBuilder().setName("dev_status").addStringOption(opt => opt.setName("status").setDescription("Status type").setRequired(true).addChoices({ name: "Online", value: "online" }, { name: "Idle", value: "idle" }, { name: "DND", value: "dnd" }, { name: "Invisible", value: "invisible" })).setDescription("Change bot status"),
    new SlashCommandBuilder().setName("dev_redis").addStringOption(opt => opt.setName("key").setDescription("Redis key").setRequired(true)).setDescription("Get Redis value"),
    new SlashCommandBuilder().setName("dev_redis_set").addStringOption(opt => opt.setName("key").setDescription("Redis key").setRequired(true)).addStringOption(opt => opt.setName("value").setDescription("Redis value").setRequired(true)).setDescription("Set Redis value"),
    new SlashCommandBuilder().setName("dev_stats").setDescription("Show bot statistics")
];

// --- CLIENT READY ---
client.once("ready", async () => {
    console.log(`${ICONS.bot} Logged in as ${client.user.tag}`);
    
    // Connect to Redis
    try {
        await redisClient.connect();
        console.log(`${ICONS.setting} Connected to Redis`);
    } catch (err) {
        console.error(`${ICONS.error} Redis connection failed:`, err);
    }
    
    // Register commands
    const rest = new REST({ version: '10' }).setToken(process.env.token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(cmd => cmd.toJSON()) });
        console.log(`${ICONS.announce} Registered ${commands.length} commands`);
    } catch (err) {
        console.error(`${ICONS.error} Command registration failed:`, err);
    }
    
    // Start activity rotation
    rotateActivity();
    setInterval(rotateActivity, 60 * 60 * 1000);
});

// --- DEV CHECK FUNCTION ---
function isDev(userId) {
    return userId === DEV_ID;
}

// --- COMMAND HANDLER ---
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, guildId, options, user, guild, channel, member } = interaction;
    const isAdmin = member ? member.permissions.has(PermissionFlagsBits.Administrator) : false;
    const dev = isDev(user.id);
    
    // Block non-devs from using dev commands
    if (commandName.startsWith("dev_") && !dev) {
        return interaction.reply({ 
            content: `${ICONS.error} This command is only available to the bot developer`, 
            ephemeral: true 
        });
    }
    
    try {
        // --- DEVELOPER COMMANDS ---
        if (commandName === "dev_eval") {
            const code = options.getString("code");
            try {
                let result = eval(code);
                if (typeof result !== 'string') result = require('util').inspect(result);
                if (result.length > 1900) result = result.slice(0, 1900) + "...";
                await interaction.reply({ content: `${ICONS.bot} \`\`\`js\n${result}\n\`\`\``, ephemeral: true });
            } catch (err) {
                await interaction.reply({ content: `${ICONS.error} \`\`\`js\n${err.message}\n\`\`\``, ephemeral: true });
            }
        }
        
        else if (commandName === "dev_reload") {
            const rest = new REST({ version: '10' }).setToken(process.env.token);
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(cmd => cmd.toJSON()) });
            await interaction.reply({ content: `${ICONS.announce} Reloaded ${commands.length} commands`, ephemeral: true });
        }
        
        else if (commandName === "dev_guilds") {
            const guilds = client.guilds.cache.map(g => `${g.name} - ${g.id} (${g.memberCount} members)`).join('\n');
            await interaction.reply({ content: `${ICONS.search} **Guilds:**\n\`\`\`${guilds.slice(0, 1900)}\`\`\``, ephemeral: true });
        }
        
        else if (commandName === "dev_leave") {
            const targetGuild = client.guilds.cache.get(options.getString("guildid"));
            if (!targetGuild) return interaction.reply({ content: `${ICONS.error} Guild not found`, ephemeral: true });
            await targetGuild.leave();
            await interaction.reply({ content: `${ICONS.message} Left ${targetGuild.name}`, ephemeral: true });
        }
        
        else if (commandName === "dev_activity") {
            const activity = options.getString("activity");
            client.user.setActivity(activity);
            await interaction.reply({ content: `${ICONS.setting} Activity changed to: ${activity}`, ephemeral: true });
        }
        
        else if (commandName === "dev_status") {
            const status = options.getString("status");
            await client.user.setStatus(status);
            await interaction.reply({ content: `${ICONS.setting} Status changed to: ${status}`, ephemeral: true });
        }
        
        else if (commandName === "dev_redis") {
            const key = options.getString("key");
            const value = await redisClient.get(key);
            await interaction.reply({ content: `${ICONS.search} Key: ${key}\nValue: ${value || 'null'}`, ephemeral: true });
        }
        
        else if (commandName === "dev_redis_set") {
            const key = options.getString("key");
            const value = options.getString("value");
            await redisClient.set(key, value);
            await interaction.reply({ content: `${ICONS.setting} Set ${key} = ${value}`, ephemeral: true });
        }
        
        else if (commandName === "dev_stats") {
            const uptime = Math.floor(process.uptime());
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = uptime % 60;
            await interaction.reply({
                embeds: [{
                    title: `${ICONS.bot} Bot Statistics`,
                    fields: [
                        { name: `${ICONS.user} Servers`, value: `${client.guilds.cache.size}`, inline: true },
                        { name: `${ICONS.user} Users`, value: `${client.users.cache.size}`, inline: true },
                        { name: `${ICONS.announce} Uptime`, value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
                        { name: `${ICONS.setting} Commands`, value: `${commands.length}`, inline: true },
                        { name: `${ICONS.search} Ping`, value: `${client.ws.ping}ms`, inline: true }
                    ],
                    color: 0x1A1D29
                }],
                ephemeral: true
            });
        }
        
        // --- PUBLIC COMMANDS ---
        else if (commandName === "help") {
            return interaction.reply({
                embeds: [{
                    title: `${ICONS.bot} System Command Interface`,
                    description: `Welcome to the utility grid.`,
                    color: 0x1A1D29,
                    fields: [
                        { name: `${ICONS.setting} SERVER CONFIG`, value: "`/setwelcomechannel`\n`/setleavechannel`\n`/configuration`", inline: true },
                        { name: `${ICONS.search} UTILITY MATRIX`, value: "`/purge`\n`/serverinfo`\n`/userinfo`", inline: true },
                        { name: `${ICONS.coin} ENTERTAINMENT`, value: "`/coinflip`\n`/rps`\n`/8ball`\n`/dice`", inline: true }
                    ]
                }]
            });
        }
        
        else if (commandName === "configuration") {
            const wChan = await redisClient.get(`gc:${guildId}:welcomeChannel`);
            const lChan = await redisClient.get(`gc:${guildId}:leaveChannel`);
            return interaction.reply({
                embeds: [{
                    title: `${ICONS.setting} Core Configuration`,
                    fields: [
                        { name: `${ICONS.memberAdd} Welcome Channel`, value: wChan ? `<#${wChan}>` : "Not Set", inline: true },
                        { name: `${ICONS.memberLeave} Leave Channel`, value: lChan ? `<#${lChan}>` : "Not Set", inline: true }
                    ]
                }]
            });
        }
        
        else if (commandName === "setwelcomechannel") {
            if (!isAdmin) return interaction.reply({ content: `${ICONS.error} Admin only command`, ephemeral: true });
            const channel = options.getChannel("channel");
            await redisClient.set(`gc:${guildId}:welcomeChannel`, channel.id);
            return interaction.reply(`${ICONS.setting} Welcome channel set to ${channel}`);
        }
        
        else if (commandName === "setleavechannel") {
            if (!isAdmin) return interaction.reply({ content: `${ICONS.error} Admin only command`, ephemeral: true });
            const channel = options.getChannel("channel");
            await redisClient.set(`gc:${guildId}:leaveChannel`, channel.id);
            return interaction.reply(`${ICONS.setting} Leave channel set to ${channel}`);
        }
        
        else if (commandName === "purge") {
            if (!isAdmin) return interaction.reply({ content: `${ICONS.error} Admin only command`, ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            const amount = options.getInteger("amount");
            const deleted = await channel.bulkDelete(amount, true);
            return interaction.editReply(`${ICONS.message} Deleted **${deleted.size}** messages`);
        }
        
        else if (commandName === "rps") {
            const choice = options.getString("choice");
            const botChoice = ['rock', 'paper', 'scissor'][Math.floor(Math.random() * 3)];
            const icons = { rock: ICONS.rock, paper: ICONS.paper, scissor: ICONS.scissor };
            
            let result = "";
            if (choice === botChoice) result = "Tie game";
            else if (
                (choice === "rock" && botChoice === "scissor") ||
                (choice === "paper" && botChoice === "rock") ||
                (choice === "scissor" && botChoice === "paper")
            ) result = "You win";
            else result = "I win";
            
            return interaction.reply(`${ICONS.coin} You: ${icons[choice]} | Me: ${icons[botChoice]}\n${result}`);
        }
        
        else if (commandName === "coinflip") {
            const result = Math.random() > 0.5 ? "Heads" : "Tails";
            return interaction.reply(`${ICONS.coin} Result: **${result}**`);
        }
        
        else if (commandName === "serverinfo") {
            return interaction.reply({
                embeds: [{
                    title: `${ICONS.search} ${guild.name}`,
                    fields: [
                        { name: `${ICONS.user} Members`, value: `${guild.memberCount}`, inline: true },
                        { name: `${ICONS.announce} Created`, value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: `${ICONS.bot} Owner`, value: `<@${guild.ownerId}>`, inline: true }
                    ],
                    thumbnail: { url: guild.iconURL() },
                    color: 0x1A1D29
                }]
            });
        }
        
        else if (commandName === "userinfo") {
            const target = options.getUser("user") || user;
            const memberTarget = guild.members.cache.get(target.id);
            return interaction.reply({
                embeds: [{
                    title: `${ICONS.user} ${target.username}`,
                    fields: [
                        { name: `${ICONS.search} ID`, value: target.id, inline: true },
                        { name: `${ICONS.memberAdd} Joined`, value: memberTarget ? `<t:${Math.floor(memberTarget.joinedTimestamp / 1000)}:R>` : "Unknown", inline: true },
                        { name: `${ICONS.bot} Bot`, value: target.bot ? "Yes" : "No", inline: true }
                    ],
                    thumbnail: { url: target.displayAvatarURL() },
                    color: 0x1A1D29
                }]
            });
        }
        
        else if (commandName === "8ball") {
            const question = options.getString("question");
            const responses = [
                "Definitely", "No way", "Ask again later", "Yes",
                "Don't count on it", "My sources say no", "Outlook good",
                "Very doubtful", "Without a doubt", "Signs point to yes"
            ];
            const answer = responses[Math.floor(Math.random() * responses.length)];
            return interaction.reply(`${ICONS.coin} Question: ${question}\nAnswer: ${answer}`);
        }
        
        else if (commandName === "dice") {
            const roll = Math.floor(Math.random() * 6) + 1;
            return interaction.reply(`${ICONS.coin} You rolled a **${roll}**`);
        }
        
    } catch (error) {
        console.error("Command error:", error);
        const errorMsg = interaction.deferred || interaction.replied ? "editReply" : "reply";
        await interaction[errorMsg]({ content: `${ICONS.error} Something went wrong`, ephemeral: true });
    }
});

// --- FIXED WELCOME/LEAVE EVENTS ---
client.on("guildMemberAdd", async member => {
    console.log(`Member joined: ${member.user.username} in ${member.guild.name}`);
    try {
        const chId = await redisClient.get(`gc:${member.guild.id}:welcomeChannel`);
        console.log(`Welcome channel for ${member.guild.id}: ${chId}`);
        if (chId) {
            const card = await createCard(member, "welcome");
            const channel = member.guild.channels.cache.get(chId);
            if (channel) {
                await channel.send({ content: `${ICONS.memberAdd} Welcome ${member.user.username}!`, files: [card] });
                console.log(`Welcome message sent to ${channel.name}`);
            } else {
                console.log(`Channel ${chId} not found in cache`);
            }
        }
    } catch (err) {
        console.error("Welcome error:", err);
    }
});

client.on("guildMemberRemove", async member => {
    console.log(`Member left: ${member.user.username} from ${member.guild.name}`);
    try {
        const chId = await redisClient.get(`gc:${member.guild.id}:leaveChannel`);
        console.log(`Leave channel for ${member.guild.id}: ${chId}`);
        if (chId) {
            const card = await createCard(member, "leave");
            const channel = member.guild.channels.cache.get(chId);
            if (channel) {
                await channel.send({ content: `${ICONS.memberLeave} ${member.user.username} left the server`, files: [card] });
                console.log(`Leave message sent to ${channel.name}`);
            } else {
                console.log(`Channel ${chId} not found in cache`);
            }
        }
    } catch (err) {
        console.error("Leave error:", err);
    }
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

client.login(process.env.token);

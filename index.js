const {
    Client,
    GatewayIntentBits,
    AttachmentBuilder,
    SlashCommandBuilder,
    REST,
    Routes,
    PermissionFlagsBits
} = require("discord.js");

const Canvas = require("canvas");
const fs = require("fs");
const path = require("path");
const { createClient } = require("redis");

// --- REGISTER BUNDLED FONT ---
const fontPath = path.join(__dirname, "fonts", "font.ttf");
if (fs.existsSync(fontPath)) {
    Canvas.registerFont(fontPath, { family: "BotFont" });
    console.log("✅ Custom font 'BotFont' successfully registered.");
} else {
    console.warn("⚠️ WARNING: ./fonts/font.ttf not found! Text will render as default system font.");
}

// --- SECURE PERMANENT CLOUD DATABASE (REDIS) ---
const db = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
db.on("error", (err) => console.error("❌ Redis Client Error", err));

(async () => {
    await db.connect();
    console.log("🔋 Permanent Redis Database Connected Securely.");
})();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

const DEVELOPER_ID = "1303357369622990889";

// --- STATE-OF-THE-ART CANVAS DESIGNER ---
async function createCard(member, type) {
    const canvas = Canvas.createCanvas(1024, 450);
    const ctx = canvas.getContext("2d");

    const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bgGradient.addColorStop(0, '#090d16'); 
    bgGradient.addColorStop(0.5, '#111726');
    bgGradient.addColorStop(1, '#1a102f'); 
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = type === "welcome" ? "#5865F2" : "#ED4245";
    ctx.fillRect(0, 0, canvas.width, 10);

    ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    ctx.font = "bold 76px BotFont, sans-serif";
    ctx.fillStyle = type === "welcome" ? "#10B981" : "#EF4444"; 
    ctx.fillText(type === "welcome" ? "WELCOME" : "GOODBYE", 75, 145);

    ctx.font = "52px BotFont, sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(member.user.username, 75, 230);

    ctx.font = "bold 26px BotFont, sans-serif";
    ctx.fillStyle = "#6B7280";
    ctx.shadowBlur = 0; 
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillText(`MEMBER POSITION #${member.guild.memberCount}`, 77, 305);

    const avatarSize = 220;
    const avatarX = 740;
    const avatarY = 225;

    ctx.beginPath();
    ctx.arc(avatarX, avatarY, (avatarSize / 2) + 10, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(avatarX, avatarY, (avatarSize / 2) + 4, 0, Math.PI * 2);
    ctx.fillStyle = type === "welcome" ? "#10B981" : "#EF4444";
    ctx.fill();

    const avatar = await Canvas.loadImage(
        member.user.displayAvatarURL({ extension: "png", size: 512 })
    );

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX - (avatarSize / 2), avatarY - (avatarSize / 2), avatarSize, avatarSize);
    ctx.restore();

    return new AttachmentBuilder(canvas.toBuffer(), { name: `${type}.png` });
}

// --- GLOBAL APPLICATION COMMAND REGISTER ---
client.once("clientReady", async () => {
    console.log(`🚀 System Online: ${client.user.tag}`);
    
    const commands = [
        new SlashCommandBuilder().setName("help").setDescription("📖 View full dynamic registry guide of system commands"),
        new SlashCommandBuilder().setName("setwelcomechannel").setDescription("Set the automated welcome channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addChannelOption(o => o.setName("channel").setDescription("Target channel").setRequired(true)),
        new SlashCommandBuilder().setName("setleavechannel").setDescription("Set the automated departure channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addChannelOption(o => o.setName("channel").setDescription("Target channel").setRequired(true)),
        new SlashCommandBuilder().setName("setwelcomemessage").setDescription("Configure customized welcome string template").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName("message").setDescription("Template variables: {user}").setRequired(true)),
        new SlashCommandBuilder().setName("setleavemessage").setDescription("Configure customized departure string template").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName("message").setDescription("Template variables: {user}").setRequired(true)),
        new SlashCommandBuilder().setName("configuration").setDescription("Displays active channels config mapping for this server"),
        
        new SlashCommandBuilder().setName("purge").setDescription("🧹 Mass deletes a specific volume of recent messages").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o => o.setName("amount").setDescription("Number of lines to delete (1-100)").setRequired(true)),
        new SlashCommandBuilder().setName("serverinfo").setDescription("📊 Displays detailed analytical footprints of this server"),
        new SlashCommandBuilder().setName("userinfo").setDescription("👤 Deep scans profile matrix of a specified target user").addUserOption(o => o.setName("target").setDescription("Select user profile")),

        new SlashCommandBuilder().setName("coinflip").setDescription("Wager a guess on a highly volatile high-stakes coin flip").addStringOption(o => o.setName("guess").setDescription("Heads or Tails").setRequired(true).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })),
        new SlashCommandBuilder().setName("rps").setDescription("🪨✂️📄 Challenge the core engine to Rock, Paper, Scissors").addStringOption(o => o.setName("choice").setDescription("Your weapon of choice").setRequired(true).addChoices({ name: 'Rock', value: 'rock' }, { name: 'Paper', value: 'paper' }, { name: 'Scissors', value: 'scissors' })),
        
        new SlashCommandBuilder().setName("dev-stats").setDescription("🔒 Developer Only: Internal diagnostics dashboard"),
        new SlashCommandBuilder().setName("dev-leaveserver").setDescription("🔒 Developer Only: Forces bot to terminate presence in a guild").addStringOption(o => o.setName("id").setDescription("Guild Snowflake ID").setRequired(true))
    ].map(c => c.toJSON());

    try {
        const rest = new REST({ version: "10" }).setToken(process.env.token);
        await rest.put(Routes.applicationCommands(process.env.clientId), { body: commands });
        console.log("🛸 Public Global Slash Architecture Synced Globally.");
    } catch (err) {
        console.error("❌ Failed to push application architecture commands", err);
    }
});

// --- INTERACTIONS GATEWAY HANDLER ---
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, guildId, options, user, guild, channel } = interaction;

    const welcomeChanKey = `gc:${guildId}:welcomeChannel`;
    const leaveChanKey = `gc:${guildId}:leaveChannel`;
    const welcomeMsgKey = `gc:${guildId}:welcomeMsg`;
    const leaveMsgKey = `gc:${guildId}:leaveMsg`;

    // --- DYNAMIC HELP COMMAND (PUBLIC VISIBILITY) ---
    if (commandName === "help") {
        const isDeveloper = user.id === DEVELOPER_ID;

        const helpEmbed = {
            title: "🤖 Bot Application System Guide",
            description: "Welcome to the official server utility dashboard. Below are the available command modules you can execute.",
            color: 0x5865F2, 
            thumbnail: { url: client.user.displayAvatarURL() },
            fields: [
                {
                    name: "⚙️ Server Administration Setups",
                    value: "`/setwelcomechannel` - Configure entry card channel.\n`/setleavechannel` - Configure departure card channel.\n`/setwelcomemessage` - Setup greet phrases.\n`/setleavemessage` - Setup leave phrases.\n`/configuration` - View active server map tracking layout."
                },
                {
                    name: "🧹 Utility Assets",
                    value: "`/purge` - Mass remove up to 100 messages.\n`/serverinfo` - Check advanced server telemetry details.\n`/userinfo` - Scans profile parameters of a specific member."
                },
                {
                    name: "🪙 Active Game Hub",
                    value: "`/coinflip` - Guess heads or tails.\n`/rps` - Play Rock, Paper, Scissors with the system engine."
                }
            ],
            footer: { text: "Public Release Version v2.0" }
        };

        if (isDeveloper) {
            helpEmbed.fields.push({
                name: "👑 Root System Master Overrides (Developer Unlocked)",
                value: "`/dev-stats` - View global performance matrix indices.\n`/dev-leaveserver` - Force disconnect presence from a specified guild."
            });
            helpEmbed.color = 0x10B981; 
            helpEmbed.title = "👑 Master System Command Control Dashboard";
        } else {
            helpEmbed.fields.push({
                name: "🔒 Root System Master Overrides (Locked)",
                value: "Administrative global footprint commands are strictly locked to the bot creator: <@1303357369622990889>."
            });
        }

        return interaction.reply({ embeds: [helpEmbed], ephemeral: false }); 
    }

    // 1. Administration Controls Settings
    if (commandName === "setwelcomechannel") {
        const chan = options.getChannel("channel");
        await db.set(welcomeChanKey, chan.id);
        return interaction.reply(`✨ **Configuration Updated:** Welcome cards mapped securely to <#${chan.id}>.`);
    }
    if (commandName === "setleavechannel") {
        const chan = options.getChannel("channel");
        await db.set(leaveChanKey, chan.id);
        return interaction.reply(`✨ **Configuration Updated:** Departure logs mapped securely to <#${chan.id}>.`);
    }
    if (commandName === "setwelcomemessage") {
        const msg = options.getString("message");
        await db.set(welcomeMsgKey, msg);
        return interaction.reply(`📝 **Template Registered:** New welcome format updated string.`);
    }
    if (commandName === "setleavemessage") {
        const msg = options.getString("message");
        await db.set(leaveMsgKey, msg);
        return interaction.reply(`📝 **Template Registered:** New exit message format updated string.`);
    }

    // 2. Discover Configurations Command
    if (commandName === "configuration") {
        const [wChan, lChan, wMsg, lMsg] = await Promise.all([
            db.get(welcomeChanKey), db.get(leaveChanKey),
            db.get(welcomeMsgKey), db.get(leaveMsgKey)
        ]);

        return interaction.reply({
            embeds: [{
                title: `🛡️ ${guild.name} Core Configuration Mapping`,
                color: 0x5865F2,
                fields: [
                    { name: "👋 Welcome Channel", value: wChan ? `<#${wChan}>` : "*Not Configured (Inactive)*", inline: true },
                    { name: "🏃 Leave Channel", value: lChan ? `<#${lChan}>` : "*Not Configured (Inactive)*", inline: true },
                    { name: "\u200B", value: "\u200B", inline: false },
                    { name: "💬 Welcome Message Text", value: wMsg || "`Welcome {user}!`", inline: false },
                    { name: "💬 Leave Message Text", value: lMsg || "`{user} left the server.`", inline: false }
                ],
                footer: { text: "Data loaded live from secure cloud database storage." }
            }]
        });
    }

    // 3. Purge Management Command
    if (commandName === "purge") {
        const amount = options.getInteger("amount");
        if (amount < 1 || amount > 100) return interaction.reply({ content: "❌ Amount parameter constraint execution window must fall within 1-100 threshold boundaries.", ephemeral: true });
        
        await interaction.deferReply({ ephemeral: true });
        const deleted = await channel.bulkDelete(amount, true);
        return interaction.editReply({ content: `🧹 Successfully vaporized **${deleted.size}** messages clean out of history logs.` });
    }

    // 4. Server Information Command
    if (commandName === "serverinfo") {
        return interaction.reply({
            embeds: [{
                title: `📊 Metrics Footprint: ${guild.name}`,
                thumbnail: { url: guild.iconURL({ dynamic: true }) },
                color: 0x10B981,
                fields: [
                    { name: "🆔 Server ID ID", value: `\`${guild.id}\``, inline: true },
                    { name: "👑 Server Owner", value: `<@${guild.ownerId}>`, inline: true },
                    { name: "👥 Mass Population", value: `\`${guild.memberCount} Members\``, inline: true },
                    { name: "📆 Matrix Creation Date", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: false }
                ]
            }]
        });
    }

    // 5. User Information Profile Command
    if (commandName === "userinfo") {
        const targetUser = options.getUser("target") || user;
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        return interaction.reply({
            embeds: [{
                title: `👤 Profile Account Identity File`,
                color: 0x3B82F6,
                thumbnail: { url: targetUser.displayAvatarURL({ dynamic: true }) },
                fields: [
                    { name: "🏷️ Account Handle Tag", value: `**${targetUser.username}**`, inline: true },
                    { name: "🆔 Profile Snowflake ID", value: `\`${targetUser.id}\``, inline: true },
                    { name: "🐣 Platform Account Inception", value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>`, inline: false },
                    { name: "📥 Server Inbound Arrival Timestamp", value: targetMember ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>` : "*Not located inside this guild registry*", inline: false }
                ]
            }]
        });
    }

    // 6. Mini-Game: Coinflip Logic
    if (commandName === "coinflip") {
        const playerGuess = options.getString("guess");
        const outcomes = ["heads", "tails"];
        const flipped = outcomes[Math.floor(Math.random() * outcomes.length)];

        return interaction.reply({
            content: playerGuess === flipped 
                ? `🪙 **The coin landed on ${flipped}!** You guessed correctly! <a:hypedance:715365456245131314> You win!` 
                : `🪙 **The coin landed on ${flipped}!** Unlucky break, you lost. Try again next time!`
        });
    }

    // 7. Mini-Game: RPS Logic
    if (commandName === "rps") {
        const weaponChoices = ["rock", "paper", "scissors"];
        const botWeapon = weaponChoices[Math.floor(Math.random() * weaponChoices.length)];
        const clientWeapon = options.getString("choice");

        let stateMsg = "";
        if (clientWeapon === botWeapon) stateMsg = "👔 **It's an absolute dead even stalemate tie!** Re-arm weapons and go again.";
        else if (
            (clientWeapon === "rock" && botWeapon === "scissors") ||
            (clientWeapon === "paper" && botWeapon === "rock") ||
            (clientWeapon === "scissors" && botWeapon === "paper")
        ) {
            stateMsg = `🎉 **Victory Achieved!** Your weapon **${clientWeapon}** shattered my **${botWeapon}** to absolute pieces! <a:hypedance:715365456245131314>`;
        } else {
            stateMsg = `💀 **Complete Tactical Annihilation.** My strategy using **${botWeapon}** completely counter-checked your weapon choice **${clientWeapon}**. Defeat!`;
        }

        return interaction.reply({ content: stateMsg });
    }

    // 8. Absolute System Developer Override Direct Modifiers
    if (commandName.startsWith("dev-")) {
        if (user.id !== DEVELOPER_ID) {
            return interaction.reply({ content: "❌ **Critical Access Violation:** This administrative structural asset is uniquely locked to the root developer.", ephemeral: true });
        }

        if (commandName === "dev-stats") {
            const totalGuilds = client.guilds.cache.size;
            const absoluteUsers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
            return interaction.reply({
                embeds: [{
                    title: "👑 Master Root Diagnostic Interface",
                    color: 0x10B981,
                    fields: [
                        { name: "⚙️ Node Engine Env", value: `\`${process.version}\``, inline: true },
                        { name: "🌐 Global Reach Servers", value: `\`${totalGuilds} Guilds\``, inline: true },
                        { name: "👥 Shared Tracked Users", value: `\`${absoluteUsers} Users\``, inline: true }
                    ]
                }],
                ephemeral: true
            });
        }

        if (commandName === "dev-leaveserver") {
            const targetId = options.getString("id");
            const targetGuild = client.guilds.cache.get(targetId);
            if (!targetGuild) return interaction.reply({ content: "❌ Guild structural match footprint not found in registry cache.", ephemeral: true });
            
            await targetGuild.leave();
            return interaction.reply({ content: `✅ Forced terminal departure from guild: **${targetGuild.name}** [${targetId}] complete.`, ephemeral: true });
        }
    }
});

// --- AUTOMATED INBOUND GATEWAY EVENT TRIGGER ---
client.on("guildMemberAdd", async member => {
    const wChan = await db.get(`gc:${member.guild.id}:welcomeChannel`);
    if (!wChan) return;
    const channel = member.guild.channels.cache.get(wChan);
    if (!channel) return;

    try {
        const card = await createCard(member, "welcome");
        const rawMsg = await db.get(`gc:${member.guild.id}:welcomeMsg`) || "Welcome {user}!";
        const message = rawMsg.replace("{user}", `<@${member.id}>`);

        await channel.send({ content: message, files: [card] });
    } catch (err) {
        console.error("Failed processing automatic member entry rendering card pipeline:", err);
    }
});

// --- AUTOMATED OUTBOUND GATEWAY EVENT TRIGGER ---
client.on("guildMemberRemove", async member => {
    const lChan = await db.get(`gc:${member.guild.id}:leaveChannel`);
    if (!lChan) return;
    const channel = member.guild.channels.cache.get(lChan);
    if (!channel) return;

    try {
        const card = await createCard(member, "leave");
        const rawMsg = await db.get(`gc:${member.guild.id}:leaveMsg`) || "{user} left the server.";
        const message = rawMsg.replace("{user}", member.user.username);

        await channel.send({ content: message, files: [card] });
    } catch (err) {
        console.error("Failed processing automatic member departure rendering card pipeline:", err);
    }
});

client.login(process.env.token);

const {
    Client,
    GatewayIntentBits,
    AttachmentBuilder,
    SlashCommandBuilder,
    REST,
    Routes
} = require("discord.js");

const Canvas = require("canvas");
const fs = require("fs");

const config = require("./config.json");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

let settings = {};

if (fs.existsSync("./settings.json")) {
    settings = JSON.parse(fs.readFileSync("./settings.json"));
}

function saveSettings() {
    fs.writeFileSync(
        "./settings.json",
        JSON.stringify(settings, null, 2)
    );
}

async function createCard(member, type) {
    const canvas = Canvas.createCanvas(1024, 500);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#5865F2";
    ctx.fillRect(0, 0, canvas.width, 15);

    ctx.font = "bold 70px Sans";
    ctx.fillStyle = "#ffffff";

    ctx.fillText(
        type === "welcome" ? "WELCOME" : "GOODBYE",
        50,
        120
    );

    ctx.font = "40px Sans";

    ctx.fillText(
        member.user.username,
        50,
        200
    );

    ctx.fillStyle = "#9CA3AF";

    ctx.fillText(
        `Member #${member.guild.memberCount}`,
        50,
        260
    );

    const avatar = await Canvas.loadImage(
        member.user.displayAvatarURL({
            extension: "png",
            size: 512
        })
    );

    ctx.save();

    ctx.beginPath();
    ctx.arc(820, 250, 120, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(
        avatar,
        700,
        130,
        240,
        240
    );

    ctx.restore();

    return new AttachmentBuilder(
        canvas.toBuffer(),
        { name: `${type}.png` }
    );
}

client.once("ready", async () => {
    console.log(`${client.user.tag} ready`);

    const commands = [
        new SlashCommandBuilder()
            .setName("setwelcomechannel")
            .setDescription("Set welcome channel")
            .addChannelOption(o =>
                o.setName("channel")
                    .setDescription("Channel")
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("setleavechannel")
            .setDescription("Set leave channel")
            .addChannelOption(o =>
                o.setName("channel")
                    .setDescription("Channel")
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("setwelcomemessage")
            .setDescription("Set welcome message")
            .addStringOption(o =>
                o.setName("message")
                    .setDescription("Use {user}")
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("setleavemessage")
            .setDescription("Set leave message")
            .addStringOption(o =>
                o.setName("message")
                    .setDescription("Use {user}")
                    .setRequired(true)
            )
    ].map(c => c.toJSON());

    const rest = new REST({ version: "10" })
        .setToken(config.token);

    await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands }
    );
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const guildId = interaction.guild.id;

    if (!settings[guildId]) {
        settings[guildId] = {};
    }

    if (interaction.commandName === "setwelcomechannel") {
        settings[guildId].welcomeChannel =
            interaction.options.getChannel("channel").id;

        saveSettings();

        return interaction.reply(
            "✅ Welcome channel saved."
        );
    }

    if (interaction.commandName === "setleavechannel") {
        settings[guildId].leaveChannel =
            interaction.options.getChannel("channel").id;

        saveSettings();

        return interaction.reply(
            "✅ Leave channel saved."
        );
    }

    if (interaction.commandName === "setwelcomemessage") {
        settings[guildId].welcomeMessage =
            interaction.options.getString("message");

        saveSettings();

        return interaction.reply(
            "✅ Welcome message saved."
        );
    }

    if (interaction.commandName === "setleavemessage") {
        settings[guildId].leaveMessage =
            interaction.options.getString("message");

        saveSettings();

        return interaction.reply(
            "✅ Leave message saved."
        );
    }
});

client.on("guildMemberAdd", async member => {
    const data = settings[member.guild.id];

    if (!data?.welcomeChannel) return;

    const channel = member.guild.channels.cache.get(
        data.welcomeChannel
    );

    if (!channel) return;

    const card = await createCard(member, "welcome");

    const message =
        (data.welcomeMessage ||
            "Welcome {user}!")
        .replace("{user}", `<@${member.id}>`);

    channel.send({
        content: message,
        files: [card]
    });
});

client.on("guildMemberRemove", async member => {
    const data = settings[member.guild.id];

    if (!data?.leaveChannel) return;

    const channel = member.guild.channels.cache.get(
        data.leaveChannel
    );

    if (!channel) return;

    const card = await createCard(member, "leave");

    const message =
        (data.leaveMessage ||
            "{user} left the server.")
        .replace("{user}", member.user.username);

    channel.send({
        content: message,
        files: [card]
    });
});

client.login(config.token);

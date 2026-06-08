const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");

const TOKEN = process.env.token; // make sure this is set
const CLIENT_ID = "1513494975290150992"; // your bot's client ID
const GUILD_ID = "1319429710094270554"; // your server ID

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Register a single command
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
            body: [{ name: "ping", description: "Replies with pong" }]
        });
        console.log("✅ /ping command registered");
    } catch (err) {
        console.error("Registration error:", err);
    }
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    console.log(`Received command: ${interaction.commandName}`);
    if (interaction.commandName === "ping") {
        await interaction.reply("Pong!");
    }
});

client.login(TOKEN);

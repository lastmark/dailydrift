const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const { token, devId } = require("./config");
const redis = require("./redis");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// Load commands (simple require loader)
const fs = require("fs");
for (const file of fs.readdirSync("./commands")) {
  const cmd = require(`./commands/${file}`);
  client.commands.set(cmd.data.name, cmd);
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction, client, redis);
  } catch (e) {
    console.error(e);
    interaction.reply({ content: "Error occurred.", ephemeral: true });
  }
});

client.login(token);

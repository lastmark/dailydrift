const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const { ICONS } = require('./icons');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.commands = new Collection();

fs.readdirSync('./commands').forEach(file => {
    const cmd = require(`./commands/${file}`);
    client.commands.set(cmd.data.name, cmd);
});

client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    try { await client.commands.get(i.commandName).execute(i); } 
    catch (e) { i.reply(`${ICONS.error} Error.`); }
});

client.login(process.env.token);

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { ICONS } = require('./icons');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.commands = new Collection();

// Command loader
fs.readdirSync('./commands').forEach(file => {
    const cmd = require(`./commands/${file}`);
    client.commands.set(cmd.data.name, cmd);
});

client.on('messageCreate', async msg => {
    // Basic Anti-link logic
    if (msg.content.includes('http') && !msg.author.bot) {
        msg.delete();
        msg.channel.send(`${ICONS.error} Links are blocked here.`);
    }
});

client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    const cmd = client.commands.get(i.commandName);
    try { await cmd.execute(i); } catch (e) { i.reply(`${ICONS.error} Error.`); }
});

client.login(process.env.token);

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

client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    
    const command = client.commands.get(i.commandName);
    if (!command) {
        console.error(`No command matching ${i.commandName} was found.`);
        return i.reply({ content: `${ICONS.error} Command not found!`, ephemeral: true });
    }

    try {
        await command.execute(i);
    } catch (e) {
        console.error(e); // <--- THIS WILL PRINT THE REAL ERROR IN YOUR LOGS
        await i.reply({ content: `${ICONS.error} There was an error executing this!`, ephemeral: true });
    }
});


client.login(process.env.token);

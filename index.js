const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const { ICONS } = require('./icons');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.commands = new Collection();

// LOAD COMMANDS
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const cmd = require(`./commands/${file}`);
    client.commands.set(cmd.data.name, cmd);
}

client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    const cmd = client.commands.get(i.commandName);
    if (!cmd) return;
    try { await cmd.execute(i); } catch (e) { 
        console.error(e);
        if (i.replied || i.deferred) await i.followUp(`${ICONS.error} Error.`);
        else await i.reply({ content: `${ICONS.error} Error.`, ephemeral: true });
    }
});

client.login(process.env.token);

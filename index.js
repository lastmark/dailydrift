const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const ICONS = {
    announce: "<:announcement:1513533499607351356>", bot: "<:bot:1513533291385458708>",
    coin: "<:coin_flip:1513532556140744856>", error: "<:error:1513532700202631240>",
    memberAdd: "<:memberadd:1513532586998239335>", memberLeave: "<:memberleave:1513532632992845965>",
    message: "<:message:1513533207037874196>", money: "<:money:1513532519599964270>",
    paper: "<:paper:1513532786445783151>", rock: "<:rock:1513532823301259446>",
    scissor: "<:scissor:1513532752669053090>", search: "<:search:1513533580087787530>",
    setting: "<:setting:1513533096740257993>", user: "<:user:1513533036472307814>"
};

const config = {}; // Stores { channelId, customMessage }

client.once('ready', async () => {
    const commands = [
        new SlashCommandBuilder().setName('help').setDescription('View commands'),
        new SlashCommandBuilder().setName('setwelcome').setDescription('Set welcome channel').addChannelOption(o => o.setName('channel').setRequired(true)),
        new SlashCommandBuilder().setName('setleave').setDescription('Set leave channel').addChannelOption(o => o.setName('channel').setRequired(true)),
        new SlashCommandBuilder().setName('setwelcomemessage').setDescription('Set custom welcome text').addStringOption(o => o.setName('text').setRequired(true)),
        new SlashCommandBuilder().setName('setleavemessage').setDescription('Set custom leave text').addStringOption(o => o.setName('text').setRequired(true)),
        new SlashCommandBuilder().setName('purge').setDescription('Clear msgs').addIntegerOption(o => o.setName('amount').setRequired(true)),
        new SlashCommandBuilder().setName('info').setDescription('Server info'),
        new SlashCommandBuilder().setName('rps').setDescription('RPS').addStringOption(o => o.setName('choice').addChoices({name:'Rock', value:'rock'}, {name:'Paper', value:'paper'}, {name:'Scissor', value:'scissor'}))
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
    console.log("System Online & Synced.");
});

client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    const gid = i.guild.id;
    if (!config[gid]) config[gid] = { welcomeChan: null, leaveChan: null, welcomeMsg: "Welcome {user}!", leaveMsg: "{user} left!" };

    // SETTINGS
    if (i.commandName === 'setwelcome') {
        config[gid].welcomeChan = i.options.getChannel('channel').id;
        i.reply(`${ICONS.memberAdd} Welcome channel set.`);
    }
    if (i.commandName === 'setleave') {
        config[gid].leaveChan = i.options.getChannel('channel').id;
        i.reply(`${ICONS.memberLeave} Leave channel set.`);
    }
    if (i.commandName === 'setwelcomemessage') {
        config[gid].welcomeMsg = i.options.getString('text');
        i.reply(`${ICONS.message} Welcome message updated.`);
    }
    if (i.commandName === 'setleavemessage') {
        config[gid].leaveMsg = i.options.getString('text');
        i.reply(`${ICONS.message} Leave message updated.`);
    }

    // UTILS & GAMES
    if (i.commandName === 'help') i.reply(`${ICONS.bot} **Commands:** /setwelcome, /setleave, /setwelcomemessage, /setleavemessage, /purge, /info, /rps`);
    if (i.commandName === 'purge') {
        const deleted = await i.channel.bulkDelete(i.options.getInteger('amount'), true);
        i.reply({ content: `${ICONS.message} Deleted ${deleted.size} msgs.`, ephemeral: true });
    }
    if (i.commandName === 'info') i.reply(`${ICONS.search} Server: ${i.guild.name} | Members: ${i.guild.memberCount}`);
    if (i.commandName === 'rps') {
        const c = i.options.getString('choice');
        const b = ['rock', 'paper', 'scissor'][Math.floor(Math.random() * 3)];
        const m = { rock: ICONS.rock, paper: ICONS.paper, scissor: ICONS.scissor };
        i.reply(`You: ${m[c]} | Me: ${m[b]}`);
    }
});

// EVENTS
client.on('guildMemberAdd', m => {
    const c = config[m.guild.id];
    if (c?.welcomeChan) {
        const text = c.welcomeMsg.replace('{user}', `<@${m.id}>`);
        m.guild.channels.cache.get(c.welcomeChan).send(`${ICONS.memberAdd} ${text}`);
    }
});

client.on('guildMemberRemove', m => {
    const c = config[m.guild.id];
    if (c?.leaveChan) {
        const text = c.leaveMsg.replace('{user}', m.user.username);
        m.guild.channels.cache.get(c.leaveChan).send(`${ICONS.memberLeave} ${text}`);
    }
});

client.login(process.env.token);

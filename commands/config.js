const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ICONS } = require('../icons');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config').setDescription('Setup server settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(o => o.setName('welcome').setDescription('Welcome channel'))
        .addChannelOption(o => o.setName('leave').setDescription('Leave channel')),
    async execute(i) {
        const w = i.options.getChannel('welcome');
        const l = i.options.getChannel('leave');
        await i.reply(`${ICONS.setting} Settings saved.`);
    }
};

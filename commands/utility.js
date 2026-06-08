const { SlashCommandBuilder } = require('discord.js');
const { ICONS } = require('../icons');

module.exports = {
    data: new SlashCommandBuilder().setName('info').setDescription('Diagnostics'),
    async execute(i) {
        await i.reply(`${ICONS.search} Server: ${i.guild.name} | Members: ${i.guild.memberCount}`);
    }
};

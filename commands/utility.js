const { SlashCommandBuilder } = require('discord.js');
const { ICONS } = require('../icons');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('See server stats'),
    async execute(interaction) {
        await interaction.reply(`${ICONS.search} **Server Stats:**\nName: ${interaction.guild.name}\nMembers: ${interaction.guild.memberCount}`);
    }
};

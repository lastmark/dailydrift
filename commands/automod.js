const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ICONS } = require('../icons');

module.exports = {
    data: new SlashCommandBuilder().setName('automod').setDescription('Toggle anti-link mode')
        .addBooleanOption(o => o.setName('status').setRequired(true)),
    async execute(interaction) {
        // You'd save this to your Redis DB
        await interaction.reply(`${ICONS.setting} Anti-link mode updated.`);
    }
};

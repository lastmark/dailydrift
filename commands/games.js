const { SlashCommandBuilder } = require('discord.js');
const { ICONS } = require('../icons');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock, Paper, Scissors')
        .addStringOption(o => o.setName('choice').setRequired(true)
            .addChoices({name: 'Rock', value: 'rock'}, {name: 'Paper', value: 'paper'}, {name: 'Scissors', value: 'scissor'})),
    async execute(interaction) {
        const choice = interaction.options.getString('choice');
        const bot = ['rock', 'paper', 'scissor'][Math.floor(Math.random() * 3)];
        
        const map = { rock: ICONS.rock, paper: ICONS.paper, scissor: ICONS.scissor };
        
        await interaction.reply({
            content: `${ICONS.bot} **Result:**\nYour choice: ${map[choice]}\nMy choice: ${map[bot]}`
        });
    },
};

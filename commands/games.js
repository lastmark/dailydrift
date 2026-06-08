const { SlashCommandBuilder } = require('discord.js');
const { ICONS } = require('../icons');

module.exports = {
    data: new SlashCommandBuilder().setName('rps').setDescription('Rock Paper Scissors')
        .addStringOption(o => o.setName('choice').addChoices({name:'Rock', value:'rock'}, {name:'Paper', value:'paper'}, {name:'Scissor', value:'scissor'})),
    async execute(i) {
        const c = i.options.getString('choice');
        const b = ['rock', 'paper', 'scissor'][Math.floor(Math.random() * 3)];
        const m = { rock: ICONS.rock, paper: ICONS.paper, scissor: ICONS.scissor };
        await i.reply(`You: ${m[c]} | Me: ${m[b]}`);
    }
};

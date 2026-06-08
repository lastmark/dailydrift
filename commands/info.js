const { SlashCommandBuilder } = require('discord.js');
const { ICONS } = require('../icons');

module.exports = {
    data: new SlashCommandBuilder().setName('info').setDescription('Bot and server diagnostics'),
    async execute(interaction) {
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        await interaction.reply({
            embeds: [{
                title: `${ICONS.bot} System Status`,
                fields: [
                    { name: "Uptime", value: `${days}d ${hours}h`, inline: true },
                    { name: "Total Users", value: `${interaction.client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`, inline: true }
                ],
                color: 0x5865F2
            }]
        });
    }
};

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ICONS } = require('../icons');

module.exports = {
    data: new SlashCommandBuilder().setName('purge').setDescription('Clear messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(o => o.setName('amount').setRequired(true)),
    async execute(i) {
        const deleted = await i.channel.bulkDelete(i.options.getInteger('amount'), true);
        await i.reply({ content: `${ICONS.message} Cleared ${deleted.size} lines.`, ephemeral: true });
    }
};

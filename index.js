const {
    Client,
    GatewayIntentBits,
    AttachmentBuilder,
    SlashCommandBuilder,
    REST,
    Routes,
    PermissionFlagsBits
} = require("discord.js");

const Canvas = require("canvas");
const fs = require("fs");
const path = require("path");
const { createClient } = require("redis");

// --- ICON DICTIONARY ---
const ICONS = {
    announce: "<:announcement:1513533499607351356>", bot: "<:bot:1513533291385458708>",
    coin: "<:coin_flip:1513532556140744856>", error: "<:error:1513532700202631240>",
    memberAdd: "<:memberadd:1513532586998239335>", memberLeave: "<:memberleave:1513532632992845965>",
    message: "<:message:1513533207037874196>", money: "<:money:1513532519599964270>",
    paper: "<:paper:1513532786445783151>", rock: "<:rock:1513532823301259446>",
    scissor: "<:scissor:1513532752669053090>", search: "<:search:1513533580087787530>",
    setting: "<:setting:1513533096740257993>", user: "<:user:1513533036472307814>"
};

// ... (Canvas, Redis, and createCard function remain identical to your version) ...

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, guildId, options, user, guild, channel } = interaction;

    // HELP MENU
    if (commandName === "help") {
        return interaction.reply({
            embeds: [{
                title: `${ICONS.bot} System Command Interface`,
                description: `Welcome to the utility grid.`,
                color: 0x1A1D29,
                fields: [
                    { name: `${ICONS.setting} SERVER CONFIG`, value: "`/setwelcomechannel`\n`/setleavechannel`\n`/configuration`" },
                    { name: `${ICONS.search} UTILITY MATRIX`, value: "`/purge`\n`/serverinfo`\n`/userinfo`" },
                    { name: `${ICONS.coin} ENTERTAINMENT`, value: "`/coinflip`\n`/rps`" }
                ]
            }]
        });
    }

    // CONFIGURATION
    if (commandName === "configuration") {
        const [wChan, lChan] = await Promise.all([db.get(`gc:${guildId}:welcomeChannel`), db.get(`gc:${guildId}:leaveChannel`)]);
        return interaction.reply({
            embeds: [{
                title: `${ICONS.setting} Core Configuration`,
                fields: [
                    { name: `${ICONS.memberAdd} Welcome Channel`, value: wChan ? `<#${wChan}>` : "*Not Set*", inline: true },
                    { name: `${ICONS.memberLeave} Leave Channel`, value: lChan ? `<#${lChan}>` : "*Not Set*", inline: true }
                ]
            }]
        });
    }

    // ADMIN
    if (commandName === "purge") {
        await interaction.deferReply({ ephemeral: true });
        const deleted = await channel.bulkDelete(options.getInteger("amount"), true);
        return interaction.editReply(`${ICONS.message} Vaporized **${deleted.size}** messages.`);
    }

    // GAMES
    if (commandName === "rps") {
        const c = options.getString("choice");
        const b = ['rock', 'paper', 'scissor'][Math.floor(Math.random() * 3)];
        const m = { rock: ICONS.rock, paper: ICONS.paper, scissor: ICONS.scissor };
        return interaction.reply(`You chose ${m[c]} | I chose ${m[b]}`);
    }

    if (commandName === "coinflip") {
        const res = Math.random() > 0.5 ? "Heads" : "Tails";
        return interaction.reply(`${ICONS.coin} Result: **${res}**`);
    }

    // INFO
    if (commandName === "serverinfo") {
        return interaction.reply(`${ICONS.search} **Server:** ${guild.name} | **Members:** ${guild.memberCount}`);
    }
});

// EVENTS
client.on("guildMemberAdd", async member => {
    const chId = await db.get(`gc:${member.guild.id}:welcomeChannel`);
    if (chId) {
        const card = await createCard(member, "welcome");
        member.guild.channels.cache.get(chId).send({ content: `${ICONS.memberAdd} Welcome!`, files: [card] });
    }
});

client.on("guildMemberRemove", async member => {
    const chId = await db.get(`gc:${member.guild.id}:leaveChannel`);
    if (chId) {
        const card = await createCard(member, "leave");
        member.guild.channels.cache.get(chId).send({ content: `${ICONS.memberLeave} ${member.user.username} left.`, files: [card] });
    }
});

client.login(process.env.token);

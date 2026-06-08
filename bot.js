require("dotenv").config();
const { Client, GatewayIntentBits, Collection, Events } = require("discord.js");
const fs = require("fs");
const redis = require("./utils/redis");
const config = require("./config");

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

client.commands = new Collection();

// Load commands (assuming all command files are directly in ./commands)
const commandFiles = fs.readdirSync("./commands").filter(f => f.endsWith(".js"));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

// Load events
const eventFiles = fs.readdirSync("./events").filter(f => f.endsWith(".js"));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  const name = file.split(".")[0];
  client.on(name, (...args) => event(client, ...args));
}

// Slash command handler
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: `${config.ICONS.error} An error occurred.`, ephemeral: true });
  }
});

// Button handler for RPS
const rps = require("./utils/games/rps");
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  const customId = interaction.customId;
  if (customId.startsWith("rps_accept_")) {
    const challengeId = customId.replace("rps_accept_", "");
    const challenge = await rps.getChallenge(challengeId);
    if (!challenge) return interaction.reply({ content: `${config.ICONS.error} Challenge expired.`, ephemeral: true });
    if (interaction.user.id !== challenge.target) return interaction.reply({ content: `${config.ICONS.error} Not for you.`, ephemeral: true });
    // Send choice buttons (rock, paper, scissors)
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rps_choice_${challengeId}_rock`).setLabel(`${config.ICONS.rock} Rock`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rps_choice_${challengeId}_paper`).setLabel(`${config.ICONS.paper} Paper`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rps_choice_${challengeId}_scissors`).setLabel(`${config.ICONS.scissor} Scissors`).setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ content: `${config.ICONS.announce} Choose your move:`, components: [row] });
  } else if (customId.startsWith("rps_decline_")) {
    const challengeId = customId.replace("rps_decline_", "");
    await rps.deleteChallenge(challengeId);
    await interaction.reply({ content: `${config.ICONS.error} Challenge declined.`, ephemeral: true });
  }
  // Add more RPS game logic here (storing choices, comparing, announcing winner)
});

// Picture Word Race message listener
const pictureRace = require("./utils/games/pictureRace");
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const race = await pictureRace.getRace(message.channel.id);
  if (!race || !race.active) return;
  if (message.content.toLowerCase() === race.word) {
    await pictureRace.endRace(message.channel.id, message.author.id);
    await message.reply(`${config.ICONS.coin} **${message.author.tag}** won! The word was \`${race.word}\`.`);
  }
});

client.login(process.env.DISCORD_TOKEN);

const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const { token, devId } = require("./config");
const redis = require("./redis");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// Load commands (simple require loader)
const fs = require("fs");
for (const file of fs.readdirSync("./commands")) {
  const cmd = require(`./commands/${file}`);
  client.commands.set(cmd.data.name, cmd);
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction, client, redis);
  } catch (e) {
    console.error(e);
    interaction.reply({ content: "Error occurred.", ephemeral: true });
  }
});


const { welcomeCard } = require("./canvas/welcome");
const { leaveCard } = require("./canvas/leave");

client.on("guildMemberAdd", async (member) => {
  const channelId = await redis.get(`welcome:${member.guild.id}`);
  if (!channelId) return;

  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  const img = await welcomeCard(member.user, member.guild);
  channel.send({ files: [{ attachment: img, name: "welcome.png" }] });
});

client.on("guildMemberRemove", async (member) => {
  const channelId = await redis.get(`leave:${member.guild.id}`);
  if (!channelId) return;

  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  const img = await leaveCard(member.user, member.guild);
  channel.send({ files: [{ attachment: img, name: "leave.png" }] });
});
const { REST, Routes } = require("discord.js");

client.once("ready", async () => {
  console.log(`${client.user.tag} online`);

  const commands = [...client.commands.values()].map(cmd =>
    cmd.data.toJSON()
  );

  try {
    const rest = new REST({ version: "10" }).setToken(token);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log(`Registered ${commands.length} slash commands`);
  } catch (err) {
    console.error("Command registration failed:", err);
  }
});

client.login(token);

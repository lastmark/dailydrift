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

// Add this new listener right below your interactionCreate block
client.on("messageCreate", async (message) => {
  // 1. Ignore DMs and other bots
  if (!message.guild || message.author.bot) return;

  try {
    // 2. Fetch the counting channel ID from Redis
    const countingChannelId = await redis.get(`counting_channel:${message.guild.id}`);

    // 3. If the message is in the counting channel, check it
    if (countingChannelId && message.channel.id === countingChannelId) {
      
      // 👇 UPDATED SAFETY CHECK 👇
      // Only process the message if it contains numbers OR math operators (+, -, *, /, ^)
      if (!/[\d\+\-\*\/\^\(\)]/.test(message.content)) return; 

      // Pull the new math-supported counting code and run it
      const runCountingGame = require("./games/counting.js"); 
      await runCountingGame(message, redis);
    }
  } catch (error) {
    console.error("Error in counting game message listener:", error);
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
client.once("clientReady", async () => {
  console.log(`${client.user.tag} online`);

  for (const [name, cmd] of client.commands) {
    try {
      cmd.data.toJSON();
      console.log(`✅ ${name}`);
    } catch (err) {
      console.error(`❌ Broken command: ${name}`);
      console.error(err);
    }
  }

  const commands = [...client.commands.values()].map(cmd =>
    cmd.data.toJSON()
  );

  try {
    const { REST, Routes } = require("discord.js");

    const rest = new REST({ version: "10" }).setToken(token);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log(`Registered ${commands.length} commands`);
  } catch (err) {
    console.error(err);
  }
});

client.login(token);

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

client.on("interactionCreate", async (interaction) => {
  // 1. Keep your existing ChatInput command handling here...
  if (interaction.isChatInputCommand()) {
    // ... your current command deployment runner ...
  }

  // 👇 ADD THIS MODAL HANDLING BLOCK DIRECTLY UNDERNEATH 👇
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("embed_modal:")) {
      // Defer right away to avoid potential 3-second API timeouts
      await interaction.deferReply({ ephemeral: true });

      try {
        // Extract the channel ID we cached inside the custom ID string
        const targetChannelId = interaction.customId.split(":")[1];
        const targetChannel = await interaction.guild.channels.fetch(targetChannelId);

        if (!targetChannel) {
          return await interaction.editReply({ content: "❌ Could not find or access that destination channel." });
        }

        // Pull values out of the pop-up text fields
        const title = interaction.fields.getTextInputValue("embed_title");
        const description = interaction.fields.getTextInputValue("embed_description");
        let colorInput = interaction.fields.getTextInputValue("embed_color") || "#2B2D31"; // Default dark canvas hex
        const footerText = interaction.fields.getTextInputValue("embed_footer") || null;

        // Clean up hex code validation formatting
        if (!colorInput.startsWith("#")) colorInput = `#${colorInput}`;
        // Fallback to signature dark if hex is completely malformed
        if (!/^#[0-9A-F]{6}$/i.test(colorInput)) colorInput = "#2B2D31"; 

        // Dynamic construction of the requested embed layout
        const { EmbedBuilder } = require("discord.js");
        const customEmbed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(colorInput);

        if (footerText) {
          customEmbed.setFooter({ text: footerText });
        }

        // Deliver the package straight to the target channel text feeds
        await targetChannel.send({ embeds: [customEmbed] });

        // Confirm back to the designer that the payload was dropped successfully
        await interaction.editReply({ 
          content: `✅ Success! Your custom embed has been published to ${targetChannel}.` 
        });

      } catch (error) {
        console.error("Failed to construct or broadcast modal embed:", error);
        await interaction.editReply({ content: "❌ Failed to send embed. Ensure I have permissions to view/send messages in that channel." });
      }
    }
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

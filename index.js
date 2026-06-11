const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const { token, devId } = require("./config");
const redis = require("./redis");
const e = require("./emojis.js");
const fs = require("fs");
const path = require("path");

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

// ==========================================
// 🛡️ SAFE COMMAND LOADER (CRASH-PROOF & UNIFIED)
// ==========================================
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const cmd = require(filePath);
    
    // Strict inspection safeguard block
    if (cmd && cmd.data && cmd.data.name) {
      client.commands.set(cmd.data.name, cmd);
    } else {
      console.log(`❌ [SKIPPED] The file "${file}" is missing valid exports or a data property.`);
    }
  }
}

// ==========================================
// 🏎️ INTERACTION WORKFLOW HANDLER
// ==========================================
client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;

    try {
      await cmd.execute(interaction, client, redis);
    } catch (err) {
      console.error(err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "An error occurred executing this command." });
      } else {
        await interaction.reply({ content: "An error occurred executing this command.", ephemeral: true });
      }
    }
  }

  // Embed Modal Construction Subsystem
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("embed_modal:")) {
      await interaction.deferReply({ ephemeral: true });

      try {
        const targetChannelId = interaction.customId.split(":")[1];
        const targetChannel = await interaction.guild.channels.fetch(targetChannelId);

        if (!targetChannel) {
          return await interaction.editReply({ content: "❌ Could not find or access that destination channel." });
        }

        const title = interaction.fields.getTextInputValue("embed_title");
        const description = interaction.fields.getTextInputValue("embed_description");
        let colorInput = interaction.fields.getTextInputValue("embed_color") || "#2B2D31"; 
        const footerText = interaction.fields.getTextInputValue("embed_footer") || null;

        if (!colorInput.startsWith("#")) colorInput = `#${colorInput}`;
        if (!/^#[0-9A-F]{6}$/i.test(colorInput)) colorInput = "#2B2D31"; 

        const { EmbedBuilder } = require("discord.js");
        const customEmbed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(colorInput);

        if (footerText) {
          customEmbed.setFooter({ text: footerText });
        }

        await targetChannel.send({ embeds: [customEmbed] });
        await interaction.editReply({ 
          content: `${e.check || "✅"} Success! Your custom embed has been published to ${targetChannel}.` 
        });

      } catch (error) {
        console.error("Failed to construct or broadcast modal embed:", error);
        await interaction.editReply({ content: `${e.error || "❌"} Failed to send embed. Ensure I have permissions to view/send messages in that channel.` });
      }
    }
  }
});

// ==========================================
// 💬 MESSAGE FEED WORKERS (COUNTING ENGINE)
// ==========================================
client.on("messageCreate", async (message) => {
  if (message.author.id === client.user.id) return;
  if (message.content === "!!!myiddevtestt") {
    message.reply(`Your user ID is: ${message.author.id}`);
  }
});

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  try {
    const countingChannelId = await redis.get(`counting_channel:${message.guild.id}`);

    if (countingChannelId && message.channel.id === countingChannelId) {
      const pureContent = message.content.replace(/\s+/g, "");
      const isValidMathOrNumber = /^[0-9\+\-\*\/\^\(\)]+$/.test(pureContent);

      if (!isValidMathOrNumber) {
        if (message.deletable) {
          await message.delete().catch((err) => console.error("Failed to delete chat text:", err));
        }
        return; 
      }

      const runCountingGame = require("./games/counting.js"); 
      await runCountingGame(message, redis);
    }
  } catch (error) {
    console.error("Error inside counting game message listener pipeline:", error);
  }
});

// ==========================================
// 🖼️ GUILD MEMBER ENGAGEMENT CANVAS FLOWS
// ==========================================
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

// ==========================================
// 🚀 ENGINE BOOTSTRAP & REST REGISTRATION
// ==========================================
// 💡 FIXED: Changed 'clientReady' event string to 'ready' to comply with standard Discord.js layouts
client.once("ready", async () => {
  console.log(`${client.user.tag} online`);

  const commands = [];
  for (const [name, cmd] of client.commands) {
    try {
      commands.push(cmd.data.toJSON());
      console.log(`✅ Loaded Command: ${name}`);
    } catch (err) {
      console.error(`❌ Broken data conversion structure: ${name}`);
      console.error(err);
    }
  }

  try {
    const { REST, Routes } = require("discord.js");
    const rest = new REST({ version: "10" }).setToken(token);

    console.log(`Syncing ${commands.length} application slash entries to Discord gateway API...`);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log(`Successfully deployed application command nodes globally!`);
  } catch (err) {
    console.error("REST Command Deployment Error:", err);
  }
});

client.login(token);

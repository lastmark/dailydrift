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
// 🛡️ SAFE COMMAND LOADER
// ==========================================
const commandsPath = path.join(__dirname, "commands");
let commandFiles = [];

if (fs.existsSync(commandsPath)) {
  commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
}

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const cmd = require(filePath);
  
  if (cmd && cmd.data && cmd.data.name) {
    client.commands.set(cmd.data.name, cmd);
  } else {
    console.log(`❌ [SKIPPED] The file "${file}" is missing valid exports or a data property.`);
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
// 👑 DEVELOPER PREFERRED TEXT COMMAND ENGINE
// ==========================================
client.on("messageCreate", async (message) => {
  // Define your bot's text prefix (e.g., !)
  const prefix = "!"; 

  // Ignore messages that don't start with your prefix or are sent by bots
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  // Split the message into command and structural arguments
  const args = message.content.slice(prefix.length).trim().split(/+/);
  const command = args.shift().toLowerCase();

  // Handle: !shield send <@user> [optional_amount]
  if (command === "shield") {
    const subcommand = args[0]?.toLowerCase();

    if (subcommand === "send") {
      // 🔒 HARD-CODED DEVELOPER ACCREDITATION CHECK
      const DEVELOPER_ID = "YOUR_DISCORD_USER_ID"; // <--- Put your exact Discord ID string here!

      if (message.author.id !== DEVELOPER_ID) {
        // Fail completely silently, or reply with an error. 
        // Silently ignoring it keeps the command completely hidden from regular members.
        return; 
      }

      // Check for a mentioned user or a raw user ID in the second argument
      const targetUser = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
      
      if (!targetUser) {
        return message.reply("❌ **Usage Error:** You must mention a user or provide a valid user ID. \n`!shield send <@user> [amount]`");
      }

      // Parse the optional amount argument (third argument). If missing or invalid, default to 1
      let amount = parseInt(args[2]) || 1;

      if (amount <= 0) {
        return message.reply("❌ **Error:** You must transfer a valid amount of at least 1 shield.");
      }

      const guildId = message.guild.id;
      const targetKey = `eco:${guildId}:${targetUser.id}:shield`;

      // Update the user's inventory record in Redis memory
      const newTotal = await redis.incrby(targetKey, amount);

      // Reply with a clean text response or embed confirming the action
      const { EmbedBuilder } = require("discord.js");
      const transferEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: "System Administrator Override", iconURL: client.user.displayAvatarURL() })
        .setDescription(`Successfully bypassed economy infrastructure to inject assets directly into the target profile layer.`)
        .addFields(
          { name: "🎁 Recipient", value: `<@${targetUser.id}>`, inline: true },
          { name: "🛡️ Shields Transferred", value: `\`+${amount}\` units`, inline: true },
          { name: "📊 Current Inventory Balance", value: `\`${newTotal}\` active shields`, inline: false }
        )
        .setTimestamp();

      return message.reply({ embeds: [transferEmbed] });
    }
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
client.once("ready", async () => {
  console.log(`${client.user.tag} online`);

  // 🎮 SET BOT ACTIVITY STATUS
  const { ActivityType } = require("discord.js");
  client.user.setActivity("counting game 🪙", { type: ActivityType.Playing });
  client.user.setStatus("online");

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

// Run it!
client.login(token);

const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, MessageFlags } = require("discord.js");
const { token, devId } = require("./config");
const redis = require("./redis");
const e = require("./emojis.js");
const fs = require("fs");
const path = require("path");
const setupLogger = require("./logger");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember
  ]
});

setupLogger(client, redis);
client.commands = new Collection();

// ==========================================
// 📂 AUTOMATED EVENT LOADER SYSTEM
// ==========================================
const eventsPath = path.join(__dirname, "events");
let eventFiles = [];

if (fs.existsSync(eventsPath)) {
  eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"));
}

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  
  if (event && event.name) {
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client, redis));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client, redis));
    }
    console.log(`✅ Loaded Global Event: ${file}`);
  }
}

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
  // Handle Slash Commands
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;

    try {
      await cmd.execute(interaction, client, redis);
    } catch (err) {
      console.error(err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "❌ An error occurred executing this command." });
      } else {
        await interaction.reply({ content: "❌ An error occurred executing this command.", flags: MessageFlags.Ephemeral });
      }
    }
  }

  // ==========================================
  // 🖲️ BUTTON HANDLER (inline – no external file)
  // ==========================================
  if (interaction.isButton()) {
    // Ignore blackjack buttons – they are handled inside the games command
    if (interaction.customId.startsWith('blackjack_')) return;

    const { customId, user, guildId } = interaction;

    // Handle counting shop buttons
    if (customId.startsWith('counting_buy_')) {
      try {
        const item = customId.split('_')[2];
        const userId = user.id;
        const prices = { shield: 200, double: 500 };
        const price = prices[item];
        if (!price) {
          return interaction.reply({ content: "❌ Invalid item.", flags: MessageFlags.Ephemeral });
        }

        const balanceKey = `eco:${userId}:money`;
        let coins = Number(await redis.get(balanceKey) || 0);
        if (coins < price) {
          return interaction.reply({
            embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`❌ You need **${price}** coins but only have **${coins}**.`)],
            flags: MessageFlags.Ephemeral
          });
        }

        await redis.set(balanceKey, coins - price);
        if (item === 'shield') {
          await redis.incr(`eco:${userId}:shield`);
        } else if (item === 'double') {
          await redis.set(`eco:${userId}:double`, 5);
        }

        const itemNames = { shield: "🛡️ Shield", double: "⚡ Double XP (5 uses)" };
        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle("✅ Purchase Successful!")
          .setDescription(`You bought **${itemNames[item]}** for **${price}** coins!`)
          .addFields({ name: "💰 New Balance", value: `${await redis.get(balanceKey) || 0} coins`, inline: true })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        console.error("Button handler error:", err);
        if (!interaction.replied) {
          await interaction.reply({ content: "❌ Error handling button.", flags: MessageFlags.Ephemeral });
        }
      }
    }

    // If button is not recognized, ignore
    if (!interaction.replied) {
      await interaction.reply({ content: "❌ This button is not supported.", flags: MessageFlags.Ephemeral });
    }
  }

  // Embed Modal Construction Subsystem
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("embed_modal:")) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
    const countingChannelId = await redis.get(`counting:${message.guild.id}:channel`);

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
client.once("ready", async () => {
  console.log(`${client.user.tag} online`);

  const { ActivityType } = require("discord.js");
  client.user.setActivity("counting game 🪙", { type: ActivityType.Playing });
  client.user.setStatus("online");

  // ===================================================
  // 🎂 AUTOMATED MIDNIGHT BIRTHDAY CRON CHECK ENGINE
  // ===================================================
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      
      const todayStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      console.log(`🎂 [BIRTHDAY CRON] Running automated sweeps for date: ${todayStr}...`);

      const userIds = await redis.smembers(`birthdays:date:${todayStr}`);
      if (!userIds || userIds.length === 0) return;

      for (const guild of client.guilds.cache.values()) {
        try {
          const channelId = await redis.get(`birthday_channel:${guild.id}`);
          if (!channelId) continue; 

          const channel = await guild.channels.fetch(channelId).catch(() => null);
          if (!channel) continue;

          const birthdayMembersInGuild = [];
          for (const id of userIds) {
            const hasMember = await guild.members.fetch(id).catch(() => null);
            if (hasMember) birthdayMembersInGuild.push(id);
          }

          if (birthdayMembersInGuild.length > 0) {
            const mentions = birthdayMembersInGuild.map(id => `<@${id}>`).join(", ");
            
            const bdayEmbed = new EmbedBuilder()
              .setColor("#FF69B4")
              .setTitle("🎉 Happy Birthday! 🎉")
              .setDescription(`✨ Today we celebrate the wonderful day of birth for our amazing members:\n\n${mentions}\n\nDrop some love in the chat and wish them a legendary day! 🎂🎈`)
              .setThumbnail(client.user.displayAvatarURL())
              .setTimestamp();

            await channel.send({ content: mentions, embeds: [bdayEmbed] }).catch(() => null);
          }
        } catch (guildError) {
          console.error(`Error processing birthday cycle for guild ${guild.id}:`, guildError);
        }
      }
    }
  }, 60000);

  // Sync all application slash entries to Discord gateway API
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

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

// ===================================================
// 👑 GLOBAL TIME-BOUND PREMIUM CONTROLLER (DEV ONLY)
// ===================================================
client.on("messageCreate", async (message) => {
  const prefix = "!"; 
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const DEVELOPER_ID = "1303357369622990889";

  if (command === "premium") {
    if (message.author.id !== DEVELOPER_ID) return; 

    const action = args[0]?.toLowerCase(); 
    const targetUser = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);

    if (!targetUser) {
      return message.reply("❌ **Usage:** `!premium add <@user/ID> <duration>` or `!premium remove <@user/ID>`\n💡 *Durations: 1m (1 month), 3m (3 months), 1y (1 year), perm (Permanent)*");
    }

    const premiumKey = `premium:user:${targetUser.id}`;

    if (action === "add") {
      const durationInput = args[2]?.toLowerCase();
      if (!durationInput) {
        return message.reply("❌ **Error:** Please specify a duration framework. Example: `!premium add @user 1m` (Values: `1m`, `3m`, `1y`, `perm`)");
      }

      let durationSeconds = 0;
      let timeString = "";

      if (durationInput === "1m") {
        durationSeconds = 30 * 24 * 60 * 60; 
        timeString = "30 Days (1 Month)";
      } else if (durationInput === "3m") {
        durationSeconds = 90 * 24 * 60 * 60; 
        timeString = "90 Days (3 Months)";
      } else if (durationInput === "1y") {
        durationSeconds = 365 * 24 * 60 * 60; 
        timeString = "365 Days (1 Year)";
      } else if (durationInput === "perm") {
        durationSeconds = -1; 
        timeString = "Permanent (Lifetime Access)";
      } else {
        return message.reply("❌ **Invalid Duration:** Use `1m`, `3m`, `1y`, or `perm`.");
      }

      if (durationSeconds === -1) {
        await redis.set(premiumKey, "true");
      } else {
        await redis.setex(premiumKey, durationSeconds, "true");
      }

      return message.reply(`👑 **Global Premium Activated:**\n👤 **User:** ${targetUser.username} (\`${targetUser.id}\`)\n⏳ **Duration:** \`${timeString}\``);
    }

    if (action === "remove") {
      await redis.del(premiumKey);
      return message.reply(`🗑️ **Global Premium Revoked:** ${targetUser.username} has been manually stripped of network premium permissions.`);
    }
  }
});

// ==========================================
// 👑 DEVELOPER PREFERRED TEXT COMMAND ENGINE
// ==========================================
client.on("messageCreate", async (message) => {
  const prefix = "!"; 
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === "shield") {
    const subcommand = args[0]?.toLowerCase();

    if (subcommand === "send") {
      const DEVELOPER_ID = "1303357369622990889"; 

      if (message.author.id !== DEVELOPER_ID) return; 

      const targetUser = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
      
      if (!targetUser) {
        return message.reply("❌ **Usage Error:** You must mention a user or provide a valid user ID. \n`!shield send <@user> [amount]`");
      }

      let amount = parseInt(args[2]) || 1;
      if (amount <= 0) return message.reply("❌ **Error:** You must transfer a valid amount of at least 1 shield.");

      const guildId = message.guild.id;
      const targetKey = `eco:${guildId}:${targetUser.id}:shield`;
      const newTotal = await redis.incrby(targetKey, amount);

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

  const { ActivityType, EmbedBuilder } = require("discord.js");
  client.user.setActivity("counting game 🪙", { type: ActivityType.Playing });
  client.user.setStatus("online");

  // ===================================================
  // 🎂 AUTOMATED MIDNIGHT BIRTHDAY CRON CHECK ENGINE
  // ===================================================
  setInterval(async () => {
    const now = new Date();
    // Only fire when the local time hits midnight (Hour 00, Minute 00)
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
  }, 60000); // Scans the system clock once every 60 seconds safely

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

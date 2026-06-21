// index.js – Full Main Bot with Terms of Service
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, MessageFlags } = require("discord.js");
const { token, TERMS_VERSION } = require("./config");
const redis = require("./redis");
const fs = require("fs");
const path = require("path");
const { checkBlacklist, buildBlacklistEmbed } = require("./blacklist.js");
const setupLogger = require("./logger.js");

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
// 📂 EVENT LOADER
// ==========================================
const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"));
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event && event.name) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client, redis));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client, redis));
      }
      console.log(`✅ Loaded Event: ${file}`);
    }
  }
}

// ==========================================
// 🛡️ COMMAND LOADER
// ==========================================
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const cmd = require(filePath);
    if (cmd && cmd.data && cmd.data.name) {
      client.commands.set(cmd.data.name, cmd);
      console.log(`✅ Loaded Command: ${cmd.data.name}`);
    } else {
      console.log(`❌ [SKIPPED] The file "${file}" is missing valid exports or a data property.`);
    }
  }
}

// ==========================================
// 🏎️ INTERACTION HANDLER
// ==========================================
client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;

    console.log(`[SLASH] ${interaction.commandName} by ${interaction.user.tag}`);

    // ---- TERMS CHECK (skip for /terms command) ----
    if (interaction.commandName !== "terms") {
      const accepted = await redis.get(`terms:accepted:${interaction.user.id}`);
      if (accepted !== TERMS_VERSION) {
        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("📜 Terms of Service Required")
          .setDescription("You must accept the Terms of Service before using this bot.")
          .addFields({ 
            name: "Next Steps", 
            value: "Please run `/terms` to view and accept the Terms of Service." 
          })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    }

    // ---- BLACKLIST CHECK ----
    const blacklist = await checkBlacklist(redis, interaction.user.id, interaction.guild.id);
    if (blacklist) {
      const embed = buildBlacklistEmbed(blacklist.data, blacklist.type);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ---- MAINTENANCE CHECK ----
    const maintenanceKey = `maintenance:${interaction.guild.id}`;
    if (await redis.get(maintenanceKey) === "true") {
      return interaction.reply({
        content: "🔧 The bot is currently under maintenance. Please try again later.",
        flags: MessageFlags.Ephemeral
      });
    }

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
    return;
  }

  // ---- Buttons ----
  if (interaction.isButton()) {
    // ---- Terms of Service button handler ----
    if (interaction.customId === "terms_accept") {
      const userId = interaction.user.id;
      await redis.set(`terms:accepted:${userId}`, TERMS_VERSION);
      await interaction.update({
        content: "✅ You have accepted the Terms of Service. You may now use all features.",
        embeds: [],
        components: []
      });
      return;
    }

    if (interaction.customId === "terms_deny") {
      const userId = interaction.user.id;
      await redis.del(`terms:accepted:${userId}`);
      await interaction.update({
        content: "❌ You have denied the Terms of Service. You cannot use this bot until you accept.",
        embeds: [],
        components: []
      });
      return;
    }

    // ---- Blackjack buttons (ignored, handled in games command) ----
    if (interaction.customId.startsWith('blackjack_')) return;

    // ---- Counting shop buttons ----
    const { customId, user } = interaction;
    if (customId.startsWith('counting_buy_')) {
      try {
        const item = customId.split('_')[2];
        const userId = user.id;
        const prices = { shield: 200, double: 500 };
        const price = prices[item];
        if (!price) return interaction.reply({ content: "❌ Invalid item.", flags: MessageFlags.Ephemeral });

        const balanceKey = `eco:${userId}:money`;
        let coins = Number(await redis.get(balanceKey) || 0);
        if (coins < price) {
          return interaction.reply({
            embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`❌ You need **${price}** coins but only have **${coins}**.`)],
            flags: MessageFlags.Ephemeral
          });
        }

        await redis.set(balanceKey, coins - price);
        if (item === 'shield') await redis.incr(`eco:${userId}:shield`);
        else if (item === 'double') await redis.set(`eco:${userId}:double`, 5);

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

    if (!interaction.replied) {
      await interaction.reply({ content: "❌ This button is not supported.", flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // ---- Modal Submits ----
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
        if (footerText) customEmbed.setFooter({ text: footerText });

        await targetChannel.send({ embeds: [customEmbed] });
        await interaction.editReply({ content: `✅ Success! Your custom embed has been published to ${targetChannel}.` });
      } catch (error) {
        console.error("Failed to construct or broadcast modal embed:", error);
        await interaction.editReply({ content: "❌ Failed to send embed. Ensure I have permissions to view/send messages in that channel." });
      }
    }
    return;
  }
});

// ==========================================
// 💬 MESSAGE LISTENERS (Counting & ID)
// ==========================================
client.on("messageCreate", async (message) => {
  if (message.author.id === client.user.id) return;
  if (message.content === "!!!myiddevtestt") {
    message.reply(`Your user ID is: ${message.author.id}`);
  }
});

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  // ---- TERMS CHECK (prefix commands) ----
  const accepted = await redis.get(`terms:accepted:${message.author.id}`);
  if (accepted !== TERMS_VERSION) {
    // Block all prefix commands except !terms / ?terms
    if (!message.content.match(/^[!?]terms$/)) {
      return message.reply("📜 You must accept the Terms of Service first. Run `!terms` to view and accept.");
    }
    // Allow !terms to go through
  }

  // ---- BLACKLIST CHECK ----
  const blacklist = await checkBlacklist(redis, message.author.id, message.guild.id);
  if (blacklist) {
    if (message.content.startsWith("!")) {
      const embed = buildBlacklistEmbed(blacklist.data, blacklist.type);
      await message.reply({ embeds: [embed] });
      await message.delete().catch(() => {});
    }
    return;
  }

  // ---- MAINTENANCE CHECK ----
  const maintenanceKey = `maintenance:${message.guild.id}`;
  if (await redis.get(maintenanceKey) === "true") {
    if (message.content.startsWith("!")) {
      await message.reply("🔧 The bot is currently under maintenance. Please try again later.");
    }
    return;
  }

  // ---- Counting game ----
  try {
    const countingChannelId = await redis.get(`counting:${message.guild.id}:channel`);
    if (countingChannelId && message.channel.id === countingChannelId) {
      const pureContent = message.content.replace(/\s+/g, "");
      const isValidMathOrNumber = /^[0-9+\-*/^()]+$/.test(pureContent);
      if (!isValidMathOrNumber) {
        if (message.deletable) await message.delete().catch((err) => console.error("Failed to delete chat text:", err));
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
// 🖼️ WELCOME / LEAVE CARDS
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
// 🚀 READY EVENT
// ==========================================
client.once("ready", async () => {
  console.log(`${client.user.tag} online`);

  const { ActivityType } = require("discord.js");
  client.user.setActivity("/help", { type: ActivityType.Playing });
  client.user.setStatus("online");

  // ---- HEARTBEAT (for helper bot) ----
  await redis.set('bot:heartbeat', Date.now());
  setInterval(async () => {
    await redis.set('bot:heartbeat', Date.now());
  }, 60000);

  // ---- REAL‑TIME STATS UPDATER ----
  async function updateStats(guild) {
    const guildId = guild.id;
    const isPremium = await redis.get(`premium:guild:${guildId}`) !== null;

    // Total Members (free)
    const totalChannelId = await redis.get(`stats:channel:total:${guildId}`);
    if (totalChannelId) {
      const channel = guild.channels.cache.get(totalChannelId);
      if (channel) {
        const count = guild.memberCount;
        const baseName = await redis.get(`stats:baseName:total:${guildId}`) || "👥 ┃ Members";
        const newName = `${baseName} • ${count}`;
        if (channel.name !== newName) await channel.setName(newName).catch(() => {});
      }
    }

    // Online Users (free)
    const onlineChannelId = await redis.get(`stats:channel:online:${guildId}`);
    if (onlineChannelId) {
      const channel = guild.channels.cache.get(onlineChannelId);
      if (channel) {
        const onlineCount = guild.members.cache.filter(m => m.presence && ["online", "idle", "dnd"].includes(m.presence.status)).size;
        const baseName = await redis.get(`stats:baseName:online:${guildId}`) || "🟢 ┃ Online";
        const newName = `${baseName} • ${onlineCount}`;
        if (channel.name !== newName) await channel.setName(newName).catch(() => {});
      }
    }

    // Voice Activity (premium only)
    if (isPremium) {
      const voiceChannelId = await redis.get(`stats:channel:voice:${guildId}`);
      if (voiceChannelId) {
        const channel = guild.channels.cache.get(voiceChannelId);
        if (channel) {
          const voiceCount = guild.members.cache.filter(m => m.voice.channel).size;
          const baseName = await redis.get(`stats:baseName:voice:${guildId}`) || "🎙️ ┃ Voice";
          const newName = `${baseName} • ${voiceCount}`;
          if (channel.name !== newName) await channel.setName(newName).catch(() => {});
        }
      }

      // Joined Today (premium only)
      const joinedChannelId = await redis.get(`stats:channel:joined:${guildId}`);
      if (joinedChannelId) {
        const channel = guild.channels.cache.get(joinedChannelId);
        if (channel) {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const joinedCount = guild.members.cache.filter(m => m.joinedAt && m.joinedAt >= today).size;
          const baseName = await redis.get(`stats:baseName:joined:${guildId}`) || "📅 ┃ Joined Today";
          const newName = `${baseName} • ${joinedCount}`;
          if (channel.name !== newName) await channel.setName(newName).catch(() => {});
        }
      }
    }
  }

  // ---- STATS UPDATER INTERVAL (every 30s) ----
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      await updateStats(guild);
    }
  }, 30000);

  // ---- TRIGGER STATS ON EVENTS ----
  client.on("guildMemberAdd", async (member) => {
    await updateStats(member.guild);
  });
  client.on("guildMemberRemove", async (member) => {
    await updateStats(member.guild);
  });
  client.on("presenceUpdate", async (oldPresence, newPresence) => {
    if (newPresence.guild) await updateStats(newPresence.guild);
  });
  client.on("voiceStateUpdate", async (oldState, newState) => {
    const guild = newState.guild;
    const isPremium = await redis.get(`premium:guild:${guild.id}`) !== null;
    if (isPremium) await updateStats(guild);
  });

  // ---- BIRTHDAY CRON ----
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      const todayStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      console.log(`🎂 [BIRTHDAY CRON] Running for date: ${todayStr}...`);
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

  // ---- DEPLOY SLASH COMMANDS ----
  const commands = [];
  for (const [name, cmd] of client.commands) {
    try {
      commands.push(cmd.data.toJSON());
    } catch (err) {
      console.error(`❌ Broken data conversion structure: ${name}`);
      console.error(err);
    }
  }
  try {
    const { REST, Routes } = require("discord.js");
    const rest = new REST({ version: "10" }).setToken(token);
    console.log(`Syncing ${commands.length} application slash entries...`);
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

// index.js
require("dotenv").config();
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, MessageFlags } = require("discord.js");
const { token, TERMS_VERSION } = require("./config");
const db = require("./database"); // Swapped out Redis for clean MongoDB wrapper instance
const fs = require("fs");
const path = require("path");
const { checkBlacklist, buildBlacklistEmbed } = require("./blacklist.js");
const setupLogger = require("./logger.js");
const { createTicket } = require("./commands/ticket.js");
const { initGiveawayEngine } = require("./engines/giveawayManager");

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

setupLogger(client, db);
client.commands = new Collection();

const processedMessages = new Set();

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
        client.once(event.name, (...args) => event.execute(...args, client, db));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client, db));
      }
      console.log(`✅ Loaded Event: ${file}`);
    }
  }
}

// ==========================================
// 🛡️ IMPROVED COMMAND LOADER (With Error Trace)
// ==========================================
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
      console.log(`--- Attempting to load: ${file} ---`); // This line will pinpoint the culprit
      const cmd = require(filePath);
      if (cmd && cmd.data && cmd.data.name) {
        client.commands.set(cmd.data.name, cmd);
        console.log(`✅ Loaded Command: ${cmd.data.name}`);
      } else {
        console.log(`❌ [SKIPPED] "${file}" is missing valid exports or data.`);
      }
    } catch (err) {
      console.error(`❌ FATAL ERROR LOADING: ${file}`);
      console.error(err);
      process.exit(1); // Force the bot to stop so you can see the log
    }
  }
}

// ==========================================
// 👑 INTERACTION HANDLER
// ==========================================
client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;

    console.log(`[SLASH] ${interaction.commandName} by ${interaction.user.tag}`);

    if (interaction.commandName !== "terms") {
      const accepted = await db.get(`terms:accepted:${interaction.user.id}`);
      if (accepted !== TERMS_VERSION) {
        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("📜 Terms of Service Required")
          .setDescription("You must accept the Terms of Service before using this bot.")
          .addFields({ name: "Next Steps", value: "Please run `/terms` to view and accept the Terms of Service." })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    }

    const blacklist = await checkBlacklist(db, interaction.user.id, interaction.guild.id);
    if (blacklist) {
      const embed = buildBlacklistEmbed(blacklist.data, blacklist.type);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const maintenanceKey = `maintenance:${interaction.guild.id}`;
    if (await db.get(maintenanceKey) === "true") {
      return interaction.reply({
        content: "🔧 The bot is currently under maintenance. Please try again later.",
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      await cmd.execute(interaction, client, db);
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
    
    // ⚙️ ---- GIVEAWAY BUTTON JOIN HANDLER ----
    if (interaction.customId === "giveaway_join") {
      const msgId = interaction.message.id;
      const giveawayData = await db.hgetall(`giveaway:${msgId}`);

      if (!giveawayData || giveawayData.ended === "true") {
        return interaction.reply({ content: "❌ **Error:** This giveaway has already ended.", flags: MessageFlags.Ephemeral });
      }

      const userId = interaction.user.id;
      const registryKey = `giveaway:entries:${msgId}`;
      const alreadyEntered = await db.sismember(registryKey, userId);

      if (alreadyEntered) {
        await db.srem(registryKey, userId);
        const count = await db.scard(registryKey);
        
        const oldEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(oldEmbed).setFooter({ text: `ACTIVE • ${count} ${count === 1 ? 'ENTRY' : 'ENTRIES'}` });
        await interaction.message.edit({ embeds: [updatedEmbed] });

        return interaction.reply({ content: "⚠️ **Left Pool:** You removed your entry from this giveaway.", flags: MessageFlags.Ephemeral });
      } else {
        await db.sadd(registryKey, userId);
        const count = await db.scard(registryKey);

        const oldEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(oldEmbed).setFooter({ text: `ACTIVE • ${count} ${count === 1 ? 'ENTRY' : 'ENTRIES'}` });
        await interaction.message.edit({ embeds: [updatedEmbed] });

        return interaction.reply({ content: "🔒 **Entered:** You are now successfully entered into the raffle pool.", flags: MessageFlags.Ephemeral });
      }
    }

    // 🚀 ---- ROCKET CASHOUT HANDLER ----
    if (interaction.customId === "rocket_cashout_trigger") {
      const rocketCommand = client.commands.get("rocket");
      if (rocketCommand && rocketCommand.handleButton) {
        try { await rocketCommand.handleButton(interaction, db, client); } catch (err) { console.error(err); }
        return;
      }
    }

    if (interaction.customId === "terms_accept") {
      const userId = interaction.user.id;
      await db.set(`terms:accepted:${userId}`, TERMS_VERSION);
      await interaction.update({ content: "✅ You have accepted the Terms of Service. You may now use all features.", embeds: [], components: [] });
      return;
    }

    if (interaction.customId === "terms_deny") {
      const userId = interaction.user.id;
      await db.del(`terms:accepted:${userId}`);
      await interaction.update({ content: "❌ You have denied the Terms of Service. You cannot use this bot until you accept.", embeds: [], components: [] });
      return;
    }

    if (interaction.customId === "ticket_create_panel") {
      const accepted = await db.get(`terms:accepted:${interaction.user.id}`);
      if (accepted !== TERMS_VERSION) return interaction.reply({ content: "📜 You must accept the Terms of Service first.", flags: MessageFlags.Ephemeral });
      const blacklist = await checkBlacklist(db, interaction.user.id, interaction.guild.id);
      if (blacklist) return interaction.reply({ embeds: [buildBlacklistEmbed(blacklist.data, blacklist.type)], flags: MessageFlags.Ephemeral });
      if (await db.get(`maintenance:${interaction.guild.id}`) === "true") return interaction.reply({ content: "🔧 The bot is under maintenance.", flags: MessageFlags.Ephemeral });

      await createTicket(interaction, client, db, interaction.user.id, "support");
      return;
    }

    if (interaction.customId.startsWith("ticket_")) {
      const [action, channelId] = interaction.customId.split(':');
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: "❌ Ticket channel not found.", flags: MessageFlags.Ephemeral });
      const data = await db.hgetall(`ticket:${interaction.guild.id}:${channelId}`);
      if (!data || !data.creator) return interaction.reply({ content: "❌ Invalid ticket.", flags: MessageFlags.Ephemeral });

      if (action === "ticket_claim") {
        if (data.claimedBy) return interaction.reply({ content: `❌ Already claimed by <@${data.claimedBy}>.`, flags: MessageFlags.Ephemeral });
        const supportRoleId = await db.get(`ticket:settings:${interaction.guild.id}:support_role`);
        if (supportRoleId && !interaction.member.roles.cache.has(supportRoleId)) return interaction.reply({ content: "❌ You don't have permission to claim.", flags: MessageFlags.Ephemeral });
        await db.hset(`ticket:${interaction.guild.id}:${channelId}`, "claimedBy", interaction.user.id);
        await channel.send(`✅ ${interaction.user} has claimed this ticket.`);
        return interaction.reply({ content: "✅ Ticket claimed!", flags: MessageFlags.Ephemeral });
      }
      if (action === "ticket_add_user") return interaction.reply({ content: "Use `/ticket add @user` to add someone.", flags: MessageFlags.Ephemeral });
      if (action === "ticket_close") return interaction.reply({ content: "Use `/ticket close` in the ticket channel.", flags: MessageFlags.Ephemeral });
      return interaction.reply({ content: "❌ Unknown ticket action.", flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('blackjack_') || interaction.customId.startsWith('mines_')) return;

    const { customId, user } = interaction;
    if (customId.startsWith('counting_buy_')) {
      try {
        const item = customId.split('_')[2];
        const prices = { shield: 200, double: 500 };
        const price = prices[item];
        if (!price) return interaction.reply({ content: "❌ Invalid item.", flags: MessageFlags.Ephemeral });

        const balanceKey = `eco:${user.id}:money`;
        let coins = Number(await db.get(balanceKey) || 0);
        if (coins < price) {
          return interaction.reply({ embeds: [new EmbedBuilder().setColor("#ED4245").setDescription(`❌ You need **${price}** units but only have **${coins}**.`)], flags: MessageFlags.Ephemeral });
        }

        await db.set(balanceKey, coins - price);
        if (item === 'shield') await db.incr(`eco:${user.id}:shield`);
        else if (item === 'double') await db.set(`eco:${user.id}:double`, 5);

        const itemNames = { shield: "🛡️ Shield", double: "⚡ Double XP (5 uses)" };
        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle("✅ Purchase Successful!")
          .setDescription(`You bought **${itemNames[item]}** for **${price}** units!`)
          .addFields({ name: "💰 New Balance", value: `${await db.get(balanceKey) || 0} units`, inline: true })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        console.error(err);
        if (!interaction.replied) await interaction.reply({ content: "❌ Error handling button.", flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "shop_menu_select") {
    const shopCommand = client.commands.get("shop");
    if (shopCommand && shopCommand.handleMenu) {
      try { await shopCommand.handleMenu(interaction, db); } catch (err) { console.error(err); }
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("embed_modal:")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const targetChannelId = interaction.customId.split(":")[1];
      const targetChannel = await interaction.guild.channels.fetch(targetChannelId);
      if (!targetChannel) return await interaction.editReply({ content: "❌ Could not find or access that destination channel." });

      const title = interaction.fields.getTextInputValue("embed_title");
      const description = interaction.fields.getTextInputValue("embed_description");
      let colorInput = interaction.fields.getTextInputValue("embed_color") || "#2B2D31";
      const footerText = interaction.fields.getTextInputValue("embed_footer") || null;

      if (!colorInput.startsWith("#")) colorInput = `#${colorInput}`;
      if (!/^#[0-9A-F]{6}$/i.test(colorInput)) colorInput = "#2B2D31";

      const customEmbed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(colorInput);
      if (footerText) customEmbed.setFooter({ text: footerText });

      await targetChannel.send({ embeds: [customEmbed] });
      await interaction.editReply({ content: `✅ Success! Your custom embed has been published to ${targetChannel}.` });
    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: "❌ Failed to send embed." });
    }
    return;
  }
});

// ==========================================
// 💬 MESSAGE LISTENER (Guardrails & Counting Only)
// ==========================================
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (processedMessages.has(message.id)) return;
  processedMessages.add(message.id);
  setTimeout(() => processedMessages.delete(message.id), 5000);

  // 1. Blacklist Check Safeguard
  const blacklist = await checkBlacklist(db, message.author.id, message.guild.id);
  if (blacklist) {
    if (message.content.startsWith("!") || message.content.startsWith("?")) {
      await message.reply({ embeds: [buildBlacklistEmbed(blacklist.data, blacklist.type)] }).catch(() => {});
      await message.delete().catch(() => {});
    }
    return;
  }

  // 2. Maintenance Mode Safeguard
  if (await db.get(`maintenance:${message.guild.id}`) === "true") {
    if (message.content.startsWith("!") || message.content.startsWith("?")) {
      await message.reply("🔧 The bot is currently under maintenance. Please try again later.").catch(() => {});
    }
    return;
  }

  // 3. Counting Channel Mechanics
  try {
    const countingChannelId = await db.get(`counting:${message.guild.id}:channel`);
    if (countingChannelId && message.channel.id === countingChannelId) {
      const pureContent = message.content.replace(/\s+/g, "");
      if (!/^[0-9+\-*/^()]+$/.test(pureContent)) {
        if (message.deletable) await message.delete().catch(() => {});
        return;
      }
      const countingModule = await import("./games/counting.js");
      const runCountingGame = countingModule.default || countingModule;
      await runCountingGame(message, db);
      return; 
    }
  } catch (error) { 
    console.error("Counting engine error:", error); 
  }

  // 4. Prefix Chat Tracking Disabled
  if (message.content.startsWith("!") || message.content.startsWith("?")) {
    return;
  }
});

// ==========================================
// 🛡️ WELCOME / LEAVE SYSTEM WITH TEXT WRAP
// ==========================================
const { welcomeCard } = require("./canvas/welcome");
const { leaveCard } = require("./canvas/leave");

client.on("guildMemberAdd", async (member) => {
  const channelId = await db.get(`welcome:${member.guild.id}`);
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;
  
  const img = await welcomeCard(member.user, member.guild, db);
  const rawText = await db.get(`welcome:text:${member.guild.id}`) || "👋 Welcome to the server, {user}!";
  const parsedText = rawText.replace(/{user}/g, `${member.user}`).replace(/{server}/g, member.guild.name).replace(/{count}/g, member.guild.memberCount.toLocaleString());
  channel.send({ content: parsedText, files: [{ attachment: img, name: "welcome.png" }] });
});

client.on("guildMemberRemove", async (member) => {
  const channelId = await db.get(`leave:${member.guild.id}`);
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  const img = await leaveCard(member.user, member.guild, db);
  const rawText = await db.get(`leave:text:${member.guild.id}`) || "❌ {user} has left the server.";
  const parsedText = rawText.replace(/{user}/g, `**${member.user.username}**`).replace(/{server}/g, member.guild.name).replace(/{count}/g, member.guild.memberCount.toLocaleString());
  channel.send({ content: parsedText, files: [{ attachment: img, name: "leave.png" }] });
});

// ==========================================
// 🚀 READY EVENT LOOP CONTROL
// ==========================================
client.once("ready", async () => {
  console.log(`${client.user.tag} online`);

  initGiveawayEngine(client, db);

  const { ActivityType } = require("discord.js");
  client.user.setActivity("/help", { type: ActivityType.Playing });
  client.user.setStatus("online");

  await db.set('bot:heartbeat', Date.now());
  setInterval(async () => { await db.set('bot:heartbeat', Date.now()); }, 60000);

  async function updateStats(guild) {
    const guildId = guild.id;
    const isPremium = await db.get(`premium:guild:${guildId}`) !== null;

    const totalChannelId = await db.get(`stats:channel:total:${guildId}`);
    if (totalChannelId) {
      const channel = guild.channels.cache.get(totalChannelId);
      if (channel) {
        const count = guild.memberCount;
        const baseName = await db.get(`stats:baseName:total:${guildId}`) || "👥 ┃ Members";
        const newName = `${baseName} • ${count}`;
        if (channel.name !== newName) await channel.setName(newName).catch(() => {});
      }
    }

    const onlineChannelId = await db.get(`stats:channel:online:${guildId}`);
    if (onlineChannelId) {
      const channel = guild.channels.cache.get(onlineChannelId);
      if (channel) {
        const onlineCount = guild.members.cache.filter(m => m.presence && ["online", "idle", "dnd"].includes(m.presence.status)).size;
        const baseName = await db.get(`stats:baseName:online:${guildId}`) || "🟢 ┃ Online";
        const newName = `${baseName} • ${onlineCount}`;
        if (channel.name !== newName) await channel.setName(newName).catch(() => {});
      }
    }

    if (isPremium) {
      const voiceChannelId = await db.get(`stats:channel:voice:${guildId}`);
      if (voiceChannelId) {
        const channel = guild.channels.cache.get(voiceChannelId);
        if (channel) {
          const voiceCount = guild.members.cache.filter(m => m.voice.channel).size;
          const baseName = await db.get(`stats:baseName:voice:${guildId}`) || "🎙️ ┃ Voice";
          const newName = `${baseName} • ${voiceCount}`;
          if (channel.name !== newName) await channel.setName(newName).catch(() => {});
        }
      }
    }
  }

  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) { await updateStats(guild); }
  }, 30000);

  // ---- BIRTHDAY CRON ----
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      const todayStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const userIds = await db.smembers(`birthdays:date:${todayStr}`);
      if (!userIds || userIds.length === 0) return;
      for (const guild of client.guilds.cache.values()) {
        const channelId = await db.get(`birthday_channel:${guild.id}`);
        if (!channelId) continue;
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) continue;
        const birthdayMembersInGuild = [];
        for (const id of userIds) { if (await guild.members.fetch(id).catch(() => null)) birthdayMembersInGuild.push(id); }
        if (birthdayMembersInGuild.length > 0) {
          const mentions = birthdayMembersInGuild.map(id => `<@${id}>`).join(", ");
          const bdayEmbed = new EmbedBuilder()
            .setColor("#FF69B4")
            .setTitle("🎉 Happy Birthday! 🎉")
            .setDescription(`✨ Today we celebrate our amazing members:\n\n${mentions}\n\nDrop some love in the chat and wish them a legendary day! 🎂🎈`)
            .setTimestamp();
          await channel.send({ content: mentions, embeds: [bdayEmbed] }).catch(() => null);
        }
      }
    }
  }, 60000);

  const commands = [];
  for (const [name, cmd] of client.commands) { if (cmd?.data) commands.push(cmd.data.toJSON()); }
  try {
    const { REST, Routes } = require("discord.js");
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`Successfully deployed application command nodes globally!`);
  } catch (err) { console.error(err); }
});

client.login(token);

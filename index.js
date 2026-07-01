// index.js – Main Bot (MongoDB, safe pre‑checks, working /ping)
require("dotenv").config();
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, MessageFlags } = require("discord.js");
const { token, TERMS_VERSION } = require("./config");
const db = require("./database"); // MongoDB wrapper
const fs = require("fs");
const path = require("path");
const { checkBlacklist, buildBlacklistEmbed } = require("./blacklist.js");
const setupLogger = require("./logger.js");
const { createTicket } = require("./commands/ticket.js");
const { initGiveawayEngine } = require("./engines/giveawayManager");
const connectDB = require("./mongoose"); // MongoDB connection promise

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
      console.log(`❌ [SKIPPED] The file "${file}" is missing valid exports or data.`);
    }
  }
}

// ==========================================
// 👑 INTERACTION HANDLER (safe pre‑checks)
// ==========================================
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;

      console.log(`[SLASH] ${interaction.commandName} by ${interaction.user.tag}`);

      // ════════════════ TEMPORARY SAFE CHECKS ════════════════
      try {
        // Terms check (skip for /terms)
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

        // Blacklist check
        const blacklist = await checkBlacklist(db, interaction.user.id, interaction.guild.id);
        if (blacklist) {
          const embed = buildBlacklistEmbed(blacklist.data, blacklist.type);
          return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Maintenance check
        const maintenanceKey = `maintenance:${interaction.guild.id}`;
        if (await db.get(maintenanceKey) === "true") {
          return interaction.reply({
            content: "🔧 The bot is currently under maintenance. Please try again later.",
            flags: MessageFlags.Ephemeral
          });
        }
      } catch (checkError) {
        console.error("⚠️ Pre‑check error (continuing):", checkError);
        // Allow the command to run even if a check fails – just log it.
      }
      // ════════════════════════════════════════════════════════

      try {
        await cmd.execute(interaction, client, db);
      } catch (err) {
        console.error(`[SLASH] Error in ${interaction.commandName}:`, err);
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
      // ... keep all your existing button handlers ...
    }

    // ---- Select menus, modals etc. ----
    // ... (keep your existing code for shop_menu_select, embed_modal: etc.)

  } catch (err) {
    console.error("❌ FATAL interaction error:", err);
    if (!interaction.replied) {
      await interaction.reply({ content: "❌ Internal error.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

// ==========================================
// 💬 MESSAGE LISTENER (Guardrails & Counting)
// ==========================================
client.on("messageCreate", async (message) => {
  // ... (keep your existing messageCreate logic)
});

// ==========================================
// 🛡️ WELCOME / LEAVE SYSTEM
// ==========================================
const { welcomeCard } = require("./canvas/welcome");
const { leaveCard } = require("./canvas/leave");

client.on("guildMemberAdd", async (member) => {
  // ... (unchanged)
});

client.on("guildMemberRemove", async (member) => {
  // ... (unchanged)
});

// ==========================================
// 🚀 READY EVENT
// ==========================================
client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} is online!`);

  initGiveawayEngine(client, db);

  const { ActivityType } = require("discord.js");
  client.user.setActivity("/help", { type: ActivityType.Playing });
  client.user.setStatus("online");

  await db.set('bot:heartbeat', Date.now());
  setInterval(async () => { await db.set('bot:heartbeat', Date.now()); }, 60000);

  // Stats updater (unchanged)
  async function updateStats(guild) {
    // ... (same)
  }

  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) { await updateStats(guild); }
  }, 30000);

  // Birthday cron (unchanged)

  // Deploy slash commands
  const commands = [];
  for (const [name, cmd] of client.commands) {
    try {
      commands.push(cmd.data.toJSON());
    } catch (err) {
      console.error(`⚠️ Skipping ${name} due to invalid data:`, err.message);
    }
  }
  try {
    const { REST, Routes } = require("discord.js");
    const rest = new REST({ version: "10" }).setToken(token);
    console.log(`🔄 Deploying ${commands.length} slash commands...`);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`✅ Slash commands deployed globally!`);
  } catch (err) {
    console.error("REST Command Deployment Error:", err);
  }
});

// ==========================================
// 🌱 STARTUP – Wait for DB, then login
// ==========================================
(async () => {
  try {
    await connectDB();                 // wait for MongoDB
    console.log("⏳ Logging into Discord...");
    await client.login(token);
  } catch (err) {
    console.error("❌ Startup error:", err);
    process.exit(1);
  }
})();

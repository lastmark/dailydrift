require("dotenv").config();
const { Client, GatewayIntentBits, Collection, Events, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const Redis = require("ioredis");
const { createCanvas, loadImage } = require("canvas");

// ========== REDIS ==========
const redis = new Redis(process.env.REDIS_URL);
redis.on("connect", () => console.log(`[Shard ${process.env.SHARD_ID || "?"}] Redis connected`));
redis.on("error", (err) => console.error("Redis error:", err));

// ========== CONFIG ==========
const CONFIG = {
  COUNTING_KEY: (guildId, channelId) => `counting:${guildId}:${channelId}`,
  RPS_KEY: (challengeId) => `rps:${challengeId}`,
  PICTURE_RACE_KEY: (channelId) => `picrace:${channelId}`,
  PICTURE_WORDS: ["apple", "cat", "sun", "house", "fish", "bird", "car", "tree", "moon", "star"],
  DEFAULT_WELCOME_MSG: "Welcome {user} to {server}!",
  DEFAULT_LEAVE_MSG: "{user} left {server}.",
  ICONS: {
    bot: "<:bot:1513533291385458708>",
    error: "<:error:1513532700202631240>",
    message: "<:message:1513533207037874196>",
    setting: "<:setting:1513533096740257993>",
    search: "<:search:1513533580087787530>",
    coin: "<:coin_flip:1513532556140744856>",
    memberAdd: "<:memberadd:1513532586998239335>",
    memberLeave: "<:memberleave:1513532632992845965>",
    user: "<:user:1513533036472307814>",
    announce: "<:announcement:1513533499607351356>",
    rock: "<:rock:1513532823301259446>",
    paper: "<:paper:1513532786445783151>",
    scissor: "<:scissor:1513532752669053090>"
  }
};

// ========== CANVAS UTILS ==========
async function generateWelcomeImage(user, guild, customMsg, bgUrl = null) {
  const width = 800, height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (bgUrl) {
    try {
      const bg = await loadImage(bgUrl);
      ctx.drawImage(bg, 0, 0, width, height);
    } catch { drawGradient(ctx, width, height); }
  } else drawGradient(ctx, width, height);

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, width, height);

  const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
  const size = 128;
  ctx.save();
  ctx.beginPath();
  ctx.arc(width/2, 80, size/2, 0, Math.PI*2);
  ctx.clip();
  ctx.drawImage(avatar, width/2 - size/2, 80 - size/2, size, size);
  ctx.restore();

  ctx.font = "bold 32px 'Arial'";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(`Welcome ${user.username}`, width/2, 180);
  ctx.font = "24px 'Arial'";
  ctx.fillStyle = "#ddd";
  ctx.fillText(guild.name, width/2, 230);
  if (customMsg) {
    ctx.font = "20px 'Arial'";
    ctx.fillStyle = "#ccc";
    ctx.fillText(customMsg, width/2, 300);
  }

  return { attachment: canvas.toBuffer(), name: "welcome.png" };
}

async function generateLeaveImage(user, guild, customMsg, bgUrl = null) {
  const width = 800, height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (bgUrl) {
    try {
      const bg = await loadImage(bgUrl);
      ctx.drawImage(bg, 0, 0, width, height);
    } catch { drawGradient(ctx, width, height); }
  } else drawGradient(ctx, width, height);

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, width, height);

  const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
  const size = 128;
  ctx.save();
  ctx.beginPath();
  ctx.arc(width/2, 80, size/2, 0, Math.PI*2);
  ctx.clip();
  ctx.drawImage(avatar, width/2 - size/2, 80 - size/2, size, size);
  ctx.restore();

  ctx.font = "bold 32px 'Arial'";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(`Goodbye ${user.username}`, width/2, 180);
  if (customMsg) {
    ctx.font = "20px 'Arial'";
    ctx.fillStyle = "#ccc";
    ctx.fillText(customMsg, width/2, 250);
  }

  return { attachment: canvas.toBuffer(), name: "leave.png" };
}

function drawGradient(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#2c3e50");
  grad.addColorStop(1, "#1a2632");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

async function drawPictureWord(word) {
  const canvas = createCanvas(500, 500);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, 500, 500);
  ctx.fillStyle = "#000";
  ctx.font = "30px 'Arial'";
  ctx.textAlign = "center";
  
  switch(word) {
    case "apple":
      ctx.fillStyle = "#e74c3c";
      ctx.beginPath();
      ctx.ellipse(250, 250, 100, 110, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(245, 140, 10, 40);
      break;
    case "cat":
      ctx.fillStyle = "#f39c12";
      ctx.beginPath();
      ctx.ellipse(250, 250, 90, 100, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(215, 220, 10, 0, Math.PI*2);
      ctx.arc(285, 220, 10, 0, Math.PI*2);
      ctx.fill();
      break;
    default:
      ctx.fillStyle = "#555";
      ctx.fillText(word, 250, 250);
  }
  return { attachment: canvas.toBuffer(), name: "picture.png" };
}

// ========== GAME UTILS ==========
const counting = {
  async getState(guildId, channelId) {
    const key = CONFIG.COUNTING_KEY(guildId, channelId);
    const data = await redis.hgetall(key);
    if (!data || !data.active) return null;
    return {
      active: data.active === "true",
      currentNumber: parseInt(data.currentNumber) || 1,
      lastUserId: data.lastUserId || null,
    };
  },
  async setActive(guildId, channelId, active) {
    const key = CONFIG.COUNTING_KEY(guildId, channelId);
    if (active) {
      await redis.hset(key, { active: "true", currentNumber: "1", lastUserId: "" });
    } else {
      await redis.del(key);
    }
  },
  async increment(guildId, channelId, userId) {
    const key = CONFIG.COUNTING_KEY(guildId, channelId);
    await redis.hincrby(key, "currentNumber", 1);
    await redis.hset(key, "lastUserId", userId);
  },
  async reset(guildId, channelId) {
    const key = CONFIG.COUNTING_KEY(guildId, channelId);
    await redis.hset(key, "currentNumber", "1", "lastUserId", "");
  }
};

const rps = {
  async createChallenge(challengeId, challengerId, targetId, channelId) {
    const key = CONFIG.RPS_KEY(challengeId);
    await redis.setex(key, 60, JSON.stringify({
      challenger: challengerId,
      target: targetId,
      channelId,
      status: "pending"
    }));
    return key;
  },
  async getChallenge(challengeId) {
    const data = await redis.get(CONFIG.RPS_KEY(challengeId));
    return data ? JSON.parse(data) : null;
  },
  async deleteChallenge(challengeId) {
    await redis.del(CONFIG.RPS_KEY(challengeId));
  }
};

const pictureRace = {
  async startRace(channelId, word) {
    const key = CONFIG.PICTURE_RACE_KEY(channelId);
    await redis.setex(key, 30, JSON.stringify({ word, active: true, winner: null }));
  },
  async getRace(channelId) {
    const data = await redis.get(CONFIG.PICTURE_RACE_KEY(channelId));
    return data ? JSON.parse(data) : null;
  },
  async endRace(channelId, winnerId = null) {
    const key = CONFIG.PICTURE_RACE_KEY(channelId);
    if (winnerId) {
      await redis.setex(key, 10, JSON.stringify({ winner: winnerId, active: false }));
    } else {
      await redis.del(key);
    }
  }
};

// ========== DISCORD CLIENT ==========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

// ========== SLASH COMMANDS ==========
// Admin commands (developer only)
client.commands.set("dev", {
  data: new SlashCommandBuilder()
    .setName("dev")
    .setDescription("Developer commands")
    .addSubcommand(sub => sub.setName("eval").setDescription("Evaluate JS code").addStringOption(opt => opt.setName("code").setRequired(true)))
    .addSubcommand(sub => sub.setName("presence").setDescription("Set bot status").addStringOption(opt => opt.setName("text").setRequired(true))),
  async execute(interaction) {
    if (interaction.user.id !== process.env.DEV_USER_ID) 
      return interaction.reply({ content: `${CONFIG.ICONS.error} No permission.`, ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === "eval") {
      try {
        const code = interaction.options.getString("code");
        let result = eval(code);
        if (typeof result !== "string") result = require("util").inspect(result);
        await interaction.reply({ content: `${CONFIG.ICONS.bot} \`\`\`js\n${result.slice(0, 1900)}\n\`\`\``, ephemeral: true });
      } catch(e) { await interaction.reply({ content: `${CONFIG.ICONS.error} Error: ${e}`, ephemeral: true }); }
    } else if (sub === "presence") {
      const text = interaction.options.getString("text");
      interaction.client.user.setPresence({ activities: [{ name: text, type: 3 }] });
      await interaction.reply({ content: `${CONFIG.ICONS.setting} Presence set to "${text}"`, ephemeral: true });
    }
  }
});

// Config commands
client.commands.set("setwelcome", {
  data: new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Configure welcome message")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName("channel").setDescription("Set welcome channel").addChannelOption(opt => opt.setName("channel").setRequired(true)))
    .addSubcommand(sub => sub.setName("message").setDescription("Set welcome text (use {user} and {server})").addStringOption(opt => opt.setName("text").setRequired(true)))
    .addSubcommand(sub => sub.setName("image").setDescription("Set background image URL").addStringOption(opt => opt.setName("url").setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (sub === "channel") {
      const ch = interaction.options.getChannel("channel");
      await redis.set(`guild:${guildId}:welcomeChannel`, ch.id);
      await interaction.reply({ content: `${CONFIG.ICONS.setting} ✅ Welcome channel set to ${ch}`, ephemeral: true });
    } else if (sub === "message") {
      const text = interaction.options.getString("text");
      await redis.set(`guild:${guildId}:welcomeMsg`, text);
      await interaction.reply({ content: `${CONFIG.ICONS.message} ✅ Welcome message saved.`, ephemeral: true });
    } else if (sub === "image") {
      const url = interaction.options.getString("url");
      await redis.set(`guild:${guildId}:welcomeImage`, url);
      await interaction.reply({ content: `${CONFIG.ICONS.search} ✅ Welcome background set.`, ephemeral: true });
    }
  }
});

client.commands.set("setleave", {
  data: new SlashCommandBuilder()
    .setName("setleave")
    .setDescription("Configure leave message")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName("channel").setDescription("Set leave channel").addChannelOption(opt => opt.setName("channel").setRequired(true)))
    .addSubcommand(sub => sub.setName("message").setDescription("Set leave text (use {user} and {server})").addStringOption(opt => opt.setName("text").setRequired(true)))
    .addSubcommand(sub => sub.setName("image").setDescription("Set background image URL").addStringOption(opt => opt.setName("url").setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (sub === "channel") {
      const ch = interaction.options.getChannel("channel");
      await redis.set(`guild:${guildId}:leaveChannel`, ch.id);
      await interaction.reply({ content: `${CONFIG.ICONS.setting} ✅ Leave channel set to ${ch}`, ephemeral: true });
    } else if (sub === "message") {
      const text = interaction.options.getString("text");
      await redis.set(`guild:${guildId}:leaveMsg`, text);
      await interaction.reply({ content: `${CONFIG.ICONS.message} ✅ Leave message saved.`, ephemeral: true });
    } else if (sub === "image") {
      const url = interaction.options.getString("url");
      await redis.set(`guild:${guildId}:leaveImage`, url);
      await interaction.reply({ content: `${CONFIG.ICONS.search} ✅ Leave background set.`, ephemeral: true });
    }
  }
});

// Info commands
client.commands.set("userinfo", {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Get user information")
    .addUserOption(opt => opt.setName("user").setDescription("Target user")),
  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`${CONFIG.ICONS.user} ${user.tag}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: `${CONFIG.ICONS.message} ID`, value: user.id, inline: true },
        { name: `${CONFIG.ICONS.memberAdd} Joined Server`, value: member?.joinedAt?.toDateString() || "Unknown", inline: true },
        { name: `${CONFIG.ICONS.bot} Bot`, value: user.bot ? "Yes" : "No", inline: true }
      );
    await interaction.reply({ embeds: [embed] });
  }
});

client.commands.set("serverinfo", {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Get server information"),
  async execute(interaction) {
    const guild = interaction.guild;
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`${CONFIG.ICONS.announce} ${guild.name}`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: `${CONFIG.ICONS.message} ID`, value: guild.id, inline: true },
        { name: `${CONFIG.ICONS.user} Members`, value: guild.memberCount.toString(), inline: true },
        { name: `${CONFIG.ICONS.memberAdd} Owner`, value: (await guild.fetchOwner()).user.tag, inline: true }
      );
    await interaction.reply({ embeds: [embed] });
  }
});

// Games commands
client.commands.set("game", {
  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Play games")
    .addSubcommand(sub => sub.setName("counting").setDescription("Start/stop counting").addBooleanOption(opt => opt.setName("active").setDescription("true=start, false=stop").setRequired(true)))
    .addSubcommand(sub => sub.setName("rps").setDescription("Challenge someone").addUserOption(opt => opt.setName("opponent").setDescription("Who to play against").setRequired(true)))
    .addSubcommand(sub => sub.setName("picturerace").setDescription("Guess the drawn word (first correct wins)")),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "counting") {
      const active = interaction.options.getBoolean("active");
      await counting.setActive(interaction.guildId, interaction.channelId, active);
      const icon = active ? CONFIG.ICONS.coin : CONFIG.ICONS.error;
      await interaction.reply({ content: `${icon} Counting game ${active ? "started" : "stopped"} in this channel.`, ephemeral: true });
    } 
    else if (sub === "rps") {
      const opponent = interaction.options.getUser("opponent");
      if (opponent.bot) return interaction.reply({ content: `${CONFIG.ICONS.error} You cannot challenge a bot.`, ephemeral: true });
      if (opponent.id === interaction.user.id) return interaction.reply({ content: `${CONFIG.ICONS.error} You cannot play with yourself.`, ephemeral: true });
      const challengeId = `${interaction.channelId}:${Date.now()}`;
      await rps.createChallenge(challengeId, interaction.user.id, opponent.id, interaction.channelId);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rps_accept_${challengeId}`).setLabel("Accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`rps_decline_${challengeId}`).setLabel("Decline").setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({ content: `${CONFIG.ICONS.announce} ${opponent}, you have been challenged to Rock Paper Scissors by ${interaction.user}.`, components: [row] });
    }
    else if (sub === "picturerace") {
      const word = CONFIG.PICTURE_WORDS[Math.floor(Math.random() * CONFIG.PICTURE_WORDS.length)];
      await pictureRace.startRace(interaction.channelId, word);
      const image = await drawPictureWord(word);
      await interaction.reply({ content: `${CONFIG.ICONS.search} **Picture Word Race!** First to type the correct word wins. You have 30 seconds.`, files: [image] });
    }
  }
});

// ========== EVENTS ==========
client.once("ready", () => {
  console.log(`✅ Shard ${client.shard?.ids[0] || "0"} logged in as ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: "/help | am i real?", type: 3 }] });
});

client.on("guildMemberAdd", async (member) => {
  const guildId = member.guild.id;
  const channelId = await redis.get(`guild:${guildId}:welcomeChannel`);
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  let msg = await redis.get(`guild:${guildId}:welcomeMsg`) || CONFIG.DEFAULT_WELCOME_MSG;
  msg = msg.replace(/{user}/g, member.user.tag).replace(/{server}/g, member.guild.name);
  const bgUrl = await redis.get(`guild:${guildId}:welcomeImage`);
  const image = await generateWelcomeImage(member.user, member.guild, msg, bgUrl);
  
  await channel.send({ content: `${CONFIG.ICONS.memberAdd} ${msg}`, files: [image] }).catch(console.error);
});

client.on("guildMemberRemove", async (member) => {
  const guildId = member.guild.id;
  const channelId = await redis.get(`guild:${guildId}:leaveChannel`);
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  let msg = await redis.get(`guild:${guildId}:leaveMsg`) || CONFIG.DEFAULT_LEAVE_MSG;
  msg = msg.replace(/{user}/g, member.user.tag).replace(/{server}/g, member.guild.name);
  const bgUrl = await redis.get(`guild:${guildId}:leaveImage`);
  const image = await generateLeaveImage(member.user, member.guild, msg, bgUrl);
  
  await channel.send({ content: `${CONFIG.ICONS.memberLeave} ${msg}`, files: [image] }).catch(console.error);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  
  // Counting game
  const state = await counting.getState(message.guild.id, message.channel.id);
  if (state && state.active) {
    const num = parseInt(message.content);
    if (!isNaN(num)) {
      const expected = state.currentNumber;
      if (num === expected && state.lastUserId !== message.author.id) {
        await counting.increment(message.guild.id, message.channel.id, message.author.id);
        await message.react("✅");
      } else if (num !== expected || state.lastUserId === message.author.id) {
        await counting.reset(message.guild.id, message.channel.id);
        await message.react("❌");
        await message.reply(`${CONFIG.ICONS.error} Wrong! Restarting from 1. Expected ${expected}, got ${num}.`);
      }
    }
  }
  
  // Picture word race
  const race = await pictureRace.getRace(message.channel.id);
  if (race && race.active && !race.winner) {
    if (message.content.toLowerCase() === race.word) {
      await pictureRace.endRace(message.channel.id, message.author.id);
      await message.reply(`${CONFIG.ICONS.coin} **${message.author.tag}** won! The word was \`${race.word}\`.`);
    }
  }
});

// Button handler for RPS
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const customId = interaction.customId;
  
  if (customId.startsWith("rps_accept_")) {
    const challengeId = customId.replace("rps_accept_", "");
    const challenge = await rps.getChallenge(challengeId);
    if (!challenge) return interaction.reply({ content: `${CONFIG.ICONS.error} Challenge expired.`, ephemeral: true });
    if (interaction.user.id !== challenge.target) return interaction.reply({ content: `${CONFIG.ICONS.error} Not for you.`, ephemeral: true });
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rps_choice_${challengeId}_rock`).setLabel(`${CONFIG.ICONS.rock} Rock`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rps_choice_${challengeId}_paper`).setLabel(`${CONFIG.ICONS.paper} Paper`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rps_choice_${challengeId}_scissors`).setLabel(`${CONFIG.ICONS.scissor} Scissors`).setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ content: `${CONFIG.ICONS.announce} Choose your move:`, components: [row] });
  } else if (customId.startsWith("rps_decline_")) {
    const challengeId = customId.replace("rps_decline_", "");
    await rps.deleteChallenge(challengeId);
    await interaction.reply({ content: `${CONFIG.ICONS.error} Challenge declined.`, ephemeral: true });
  }
});

// Slash command handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: `${CONFIG.ICONS.error} An error occurred.`, ephemeral: true });
  }
});

// ========== LOGIN ==========
client.login(process.env.DISCORD_TOKEN);

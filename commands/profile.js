// commands/profile.js – FULLY WORKING (lowercase Redis methods + canvas)
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require("discord.js");
const { createCanvas, loadImage, registerFont, CanvasRenderingContext2D } = require("canvas");
const path = require("path");
const fs = require("fs");
const { formatNumber } = require("../utils.js");

// ---------- FONT SETUP ----------
const fontPath = path.join(__dirname, "../font.ttf");
let customFontLoaded = false;
try {
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family: "CustomFont" });
    customFontLoaded = true;
  }
} catch {}

function getFont(weight = "normal", size = 16) {
  const family = customFontLoaded ? "CustomFont" : "Arial, sans-serif";
  const emojiFallback = ", 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'EmojiOne Color', sans-serif";
  return `${weight} ${size}px ${family}${emojiFallback}`;
}

// ---------- roundRect polyfill ----------
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    return this;
  };
}

// ---------- Achievement definitions ----------
const ACHIEVEMENTS = {
  first_count: { id: 'first_count', name: 'First Count', desc: 'Made your first correct count', icon: '🎯' },
  level_10: { id: 'level_10', name: 'Level 10', desc: 'Reached level 10', icon: '⭐' },
  level_25: { id: 'level_25', name: 'Level 25', desc: 'Reached level 25', icon: '🌟' },
  level_50: { id: 'level_50', name: 'Level 50', desc: 'Reached level 50', icon: '💎' },
  level_100: { id: 'level_100', name: 'Level 100', desc: 'Reached level 100', icon: '👑' },
  daily_streak_7: { id: 'daily_streak_7', name: 'Daily Streak 7', desc: 'Claimed daily bonus 7 days in a row', icon: '📅' },
  games_10: { id: 'games_10', name: 'Game Master', desc: 'Played 10 games', icon: '🎮' },
  blackjack_win: { id: 'blackjack_win', name: 'Blackjack Winner', desc: 'Won a Blackjack game', icon: '🃏' },
  slots_win: { id: 'slots_win', name: 'Lucky Spinner', desc: 'Won a Slots game', icon: '🎰' },
  coinflip_win: { id: 'coinflip_win', name: 'Coin Flipper', desc: 'Won a Coinflip', icon: '🪙' },
  rich: { id: 'rich', name: 'Rich', desc: 'Accumulated 10,000 coins', icon: '💰' },
  friend: { id: 'friend', name: 'Social', desc: 'Added a friend', icon: '🤝' },
  married: { id: 'married', name: 'Married', desc: 'Got married', icon: '💍' },
};

function getAchievement(id) { return ACHIEVEMENTS[id]; }

// ---------- Helper: add activity feed (lowercase) ----------
async function addActivity(redis, userId, activity) {
  try {
    const key = `profile:${userId}:activityFeed`;
    const timestamp = new Date().toLocaleString();
    const entry = `[${timestamp}] ${activity}`;
    await redis.lpush(key, entry);
    await redis.ltrim(key, 0, 9);
  } catch (error) {
    console.error('addActivity error:', error);
  }
}

// ---------- Helper: grant achievement (lowercase) ----------
async function grantAchievement(redis, userId, achievementId) {
  try {
    const key = `profile:${userId}:achievements`;
    const exists = await redis.sismember(key, achievementId);
    if (!exists) {
      await redis.sadd(key, achievementId);
      return true;
    }
    return false;
  } catch (error) {
    console.error('grantAchievement error:', error);
    return false;
  }
}

module.exports = {
  category: "User",
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Manage your profile")
    .addSubcommand(sub =>
      sub.setName("view")
        .setDescription("View a user's profile")
        .addUserOption(opt => opt.setName("user").setDescription("User to view"))
    )
    .addSubcommand(sub =>
      sub.setName("setbio")
        .setDescription("Set your bio")
        .addStringOption(opt =>
          opt.setName("text")
            .setDescription("Bio (max 200 chars)")
            .setRequired(true)
            .setMaxLength(200)
        )
    )
    .addSubcommand(sub =>
      sub.setName("setcolor")
        .setDescription("Set accent color")
        .addStringOption(opt =>
          opt.setName("color")
            .setDescription("Hex color (e.g., #FF6B6B)")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("upload")
        .setDescription("Upload custom background (premium)")
        .addAttachmentOption(opt =>
          opt.setName("image")
            .setDescription("Image file")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("reset")
        .setDescription("Reset all profile data")
    )
    .addSubcommand(sub =>
      sub.setName("setstatus")
        .setDescription("Set a custom status")
        .addStringOption(opt =>
          opt.setName("status")
            .setDescription("Status text (max 60 chars)")
            .setRequired(true)
            .setMaxLength(60)
        )
    )
    .addSubcommand(sub =>
      sub.setName("settheme")
        .setDescription("Set profile theme (buy with coins)")
        .addStringOption(opt =>
          opt.setName("theme")
            .setDescription("Theme name")
            .setRequired(true)
            .addChoices(
              { name: "Neon", value: "neon" },
              { name: "Space", value: "space" },
              { name: "Nature", value: "nature" },
              { name: "Retro", value: "retro" }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("setbar")
        .setDescription("Set XP bar style (buy with coins)")
        .addStringOption(opt =>
          opt.setName("style")
            .setDescription("Bar style")
            .setRequired(true)
            .addChoices(
              { name: "Neon", value: "neon" },
              { name: "Retro", value: "retro" },
              { name: "Minimal", value: "minimal" }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("setembedbg")
        .setDescription("Set embed background color (premium)")
        .addStringOption(opt =>
          opt.setName("color")
            .setDescription("Hex color")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("link")
        .setDescription("Add a social link")
        .addStringOption(opt =>
          opt.setName("platform")
            .setDescription("Platform name")
            .setRequired(true)
            .addChoices(
              { name: "Twitter", value: "twitter" },
              { name: "Instagram", value: "instagram" },
              { name: "GitHub", value: "github" },
              { name: "YouTube", value: "youtube" },
              { name: "Twitch", value: "twitch" }
            )
        )
        .addStringOption(opt =>
          opt.setName("url")
            .setDescription("URL")
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt.setName("remove")
            .setDescription("Remove this link")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName("marry")
        .setDescription("Marry another user")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User to marry")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("divorce")
        .setDescription("Divorce your spouse")
    )
    .addSubcommand(sub =>
      sub.setName("friend")
        .setDescription("Add or remove a friend")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User to add/remove")
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt.setName("remove")
            .setDescription("Remove friend")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName("givekarma")
        .setDescription("Give karma to a user")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User to give karma")
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName("amount")
            .setDescription("Amount (1-5)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(5)
        )
    )
    .addSubcommand(sub =>
      sub.setName("setfavgame")
        .setDescription("Set your favorite game")
        .addStringOption(opt =>
          opt.setName("game")
            .setDescription("Game name")
            .setRequired(true)
            .addChoices(
              { name: "Blackjack", value: "blackjack" },
              { name: "Slots", value: "slots" },
              { name: "RPS", value: "rps" },
              { name: "Coinflip", value: "coinflip" },
              { name: "Dice", value: "dice" },
              { name: "Counting", value: "counting" }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("achievements")
        .setDescription("View your achievements")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // ---- Helpers (lowercase Redis methods) ----
    const getBalance = async (id) => Number(await redis.get(`eco:${id}:money`) || 0);
    const addBalance = async (id, amt) => await redis.incrby(`eco:${id}:money`, amt);
    const takeBalance = async (id, amt) => {
      const bal = await getBalance(id);
      if (bal < amt) return false;
      await redis.decrby(`eco:${id}:money`, amt);
      return true;
    };
    const isPremium = async (id) => {
      const val = await redis.get(`premium:user:${id}`);
      return val !== null && val !== undefined;
    };
    const isBeta = async (id) => await redis.get(`beta:user:${id}`) === "true";

    // ---- SETBIO ----
    if (sub === "setbio") {
      const text = interaction.options.getString("text");
      await redis.hset(`profile:${userId}`, "bio", text);
      await addActivity(redis, userId, "Updated bio");
      return interaction.reply({ content: "✅ Bio updated.", flags: MessageFlags.Ephemeral });
    }

    // ---- SETCOLOR ----
    if (sub === "setcolor") {
      let color = interaction.options.getString("color");
      if (!color.startsWith("#")) color = `#${color}`;
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        return interaction.reply({ content: "❌ Invalid hex color.", flags: MessageFlags.Ephemeral });
      }
      await redis.hset(`profile:${userId}`, "color", color);
      await addActivity(redis, userId, "Updated profile color");
      return interaction.reply({ content: "✅ Color updated.", flags: MessageFlags.Ephemeral });
    }

    // ---- UPLOAD (premium) ----
    if (sub === "upload") {
      const premium = await isPremium(userId);
      if (!premium) {
        return interaction.reply({ content: "❌ Premium only.", flags: MessageFlags.Ephemeral });
      }
      const attachment = interaction.options.getAttachment("image");
      if (!attachment.contentType?.startsWith("image/")) {
        return interaction.reply({ content: "❌ Invalid image.", flags: MessageFlags.Ephemeral });
      }
      await redis.hset(`profile:${userId}`, "custom_bg", attachment.url);
      await addActivity(redis, userId, "Uploaded custom background");
      return interaction.reply({ content: "✅ Background uploaded.", flags: MessageFlags.Ephemeral });
    }

    // ---- RESET ----
    if (sub === "reset") {
      await interaction.reply({ content: "⚠️ Type `confirm` to reset your profile.", flags: MessageFlags.Ephemeral });
      const collected = await interaction.channel.awaitMessages({
        filter: m => m.author.id === userId && m.content.toLowerCase() === "confirm",
        max: 1,
        time: 30000,
        errors: ['time']
      }).catch(() => null);
      if (!collected) {
        return interaction.editReply({ content: "❌ Reset cancelled." });
      }
      await redis.del(`profile:${userId}`);
      await redis.del(`profile:${userId}:theme`);
      await redis.del(`profile:${userId}:nameColor`);
      await redis.del(`profile:${userId}:socialLinks`);
      await redis.del(`profile:${userId}:status`);
      await redis.del(`profile:${userId}:marriedTo`);
      await redis.del(`profile:${userId}:friends`);
      await redis.del(`profile:${userId}:reputation`);
      await redis.del(`profile:${userId}:favGame`);
      await redis.del(`profile:${userId}:activityFeed`);
      await redis.del(`profile:${userId}:embedBg`);
      await redis.del(`profile:${userId}:barStyle`);
      await redis.del(`profile:${userId}:achievements`);
      await interaction.editReply({ content: "✅ Profile reset." });
      return;
    }

    // ---- SETSTATUS ----
    if (sub === "setstatus") {
      const status = interaction.options.getString("status");
      await redis.set(`profile:${userId}:status`, status);
      await addActivity(redis, userId, "Updated status");
      return interaction.reply({ content: "✅ Status updated.", flags: MessageFlags.Ephemeral });
    }

    // ---- SETTHEME (buy with coins) ----
    if (sub === "settheme") {
      const theme = interaction.options.getString("theme");
      const price = 500;
      const bal = await getBalance(userId);
      if (bal < price) {
        return interaction.reply({ content: `❌ You need ${price} coins. You have ${bal}.`, flags: MessageFlags.Ephemeral });
      }
      await takeBalance(userId, price);
      await redis.set(`profile:${userId}:theme`, theme);
      await addActivity(redis, userId, `Unlocked theme: ${theme}`);
      return interaction.reply({ content: `✅ Theme set to ${theme}. (${price} coins spent)`, flags: MessageFlags.Ephemeral });
    }

    // ---- SETBAR (buy with coins) ----
    if (sub === "setbar") {
      const style = interaction.options.getString("style");
      const price = 300;
      const bal = await getBalance(userId);
      if (bal < price) {
        return interaction.reply({ content: `❌ You need ${price} coins. You have ${bal}.`, flags: MessageFlags.Ephemeral });
      }
      await takeBalance(userId, price);
      await redis.set(`profile:${userId}:barStyle`, style);
      await addActivity(redis, userId, `Unlocked bar style: ${style}`);
      return interaction.reply({ content: `✅ Bar style set to ${style}. (${price} coins spent)`, flags: MessageFlags.Ephemeral });
    }

    // ---- SETEMBEDBG (premium) ----
    if (sub === "setembedbg") {
      const premium = await isPremium(userId);
      if (!premium) {
        return interaction.reply({ content: "❌ Premium only.", flags: MessageFlags.Ephemeral });
      }
      let color = interaction.options.getString("color");
      if (!color.startsWith("#")) color = `#${color}`;
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        return interaction.reply({ content: "❌ Invalid hex color.", flags: MessageFlags.Ephemeral });
      }
      await redis.set(`profile:${userId}:embedBg`, color);
      await addActivity(redis, userId, "Updated embed background");
      return interaction.reply({ content: "✅ Embed background updated.", flags: MessageFlags.Ephemeral });
    }

    // ---- LINK (add/remove social link) ----
    if (sub === "link") {
      const platform = interaction.options.getString("platform");
      const url = interaction.options.getString("url");
      const remove = interaction.options.getBoolean("remove") || false;
      const key = `profile:${userId}:socialLinks`;
      let links = await redis.get(key);
      links = links ? JSON.parse(links) : [];
      if (remove) {
        links = links.filter(l => l.platform !== platform);
        await redis.set(key, JSON.stringify(links));
        await addActivity(redis, userId, `Removed ${platform} link`);
        return interaction.reply({ content: `✅ Removed ${platform} link.`, flags: MessageFlags.Ephemeral });
      } else {
        const premium = await isPremium(userId);
        if (!premium && links.length >= 1) {
          return interaction.reply({ content: "❌ Premium needed for more than 1 link.", flags: MessageFlags.Ephemeral });
        }
        links.push({ platform, url });
        await redis.set(key, JSON.stringify(links));
        await addActivity(redis, userId, `Added ${platform} link`);
        return interaction.reply({ content: `✅ Added ${platform} link.`, flags: MessageFlags.Ephemeral });
      }
    }

    // ---- MARRY ----
    if (sub === "marry") {
      const targetUser = interaction.options.getUser("user");
      if (targetUser.id === userId) {
        return interaction.reply({ content: "❌ You can't marry yourself.", flags: MessageFlags.Ephemeral });
      }
      const currentSpouse = await redis.get(`profile:${userId}:marriedTo`);
      if (currentSpouse) {
        return interaction.reply({ content: `❌ You are already married to <@${currentSpouse}>.`, flags: MessageFlags.Ephemeral });
      }
      const targetSpouse = await redis.get(`profile:${targetUser.id}:marriedTo`);
      if (targetSpouse) {
        return interaction.reply({ content: `❌ ${targetUser.username} is already married.`, flags: MessageFlags.Ephemeral });
      }
      await interaction.reply({
        content: `💍 <@${targetUser.id}>, do you accept ${interaction.user.username}'s marriage proposal? React with ✅ within 30 seconds.`,
        fetchReply: true
      });
      const msg = await interaction.fetchReply();
      await msg.react('✅');
      const filter = (reaction, user) => reaction.emoji.name === "✅" && user.id === targetUser.id;
      try {
        const collected = await msg.awaitReactions({ filter, max: 1, time: 30000 });
        if (collected.size > 0) {
          await redis.set(`profile:${userId}:marriedTo`, targetUser.id);
          await redis.set(`profile:${targetUser.id}:marriedTo`, userId);
          await addActivity(redis, userId, `Married ${targetUser.username}`);
          await addActivity(redis, targetUser.id, `Married ${interaction.user.username}`);
          await grantAchievement(redis, userId, 'married');
          await interaction.editReply({ content: `💍 Congratulations! You are now married to ${targetUser.username}!` });
        } else {
          await interaction.editReply({ content: "❌ Proposal declined." });
        }
      } catch {
        await interaction.editReply({ content: "❌ Proposal timed out." });
      }
      return;
    }

    // ---- DIVORCE ----
    if (sub === "divorce") {
      const spouseId = await redis.get(`profile:${userId}:marriedTo`);
      if (!spouseId) {
        return interaction.reply({ content: "❌ You are not married.", flags: MessageFlags.Ephemeral });
      }
      await redis.del(`profile:${userId}:marriedTo`);
      await redis.del(`profile:${spouseId}:marriedTo`);
      await addActivity(redis, userId, `Divorced`);
      await addActivity(redis, spouseId, `Divorced`);
      return interaction.reply({ content: "💔 You are now divorced.", flags: MessageFlags.Ephemeral });
    }

    // ---- FRIEND ----
    if (sub === "friend") {
      const targetUser = interaction.options.getUser("user");
      const remove = interaction.options.getBoolean("remove") || false;
      const key = `profile:${userId}:friends`;
      if (remove) {
        await redis.srem(key, targetUser.id);
        await addActivity(redis, userId, `Removed ${targetUser.username} as friend`);
        return interaction.reply({ content: `✅ Removed ${targetUser.username} from friends.`, flags: MessageFlags.Ephemeral });
      } else {
        const exists = await redis.sismember(key, targetUser.id);
        if (exists) {
          return interaction.reply({ content: `❌ ${targetUser.username} is already your friend.`, flags: MessageFlags.Ephemeral });
        }
        await redis.sadd(key, targetUser.id);
        await grantAchievement(redis, userId, 'friend');
        await addActivity(redis, userId, `Added ${targetUser.username} as friend`);
        return interaction.reply({ content: `✅ ${targetUser.username} added as friend.`, flags: MessageFlags.Ephemeral });
      }
    }

    // ---- GIVEKARMA ----
    if (sub === "givekarma") {
      const targetUser = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      if (targetUser.id === userId) {
        return interaction.reply({ content: "❌ You can't give karma to yourself.", flags: MessageFlags.Ephemeral });
      }
      await redis.incrby(`profile:${targetUser.id}:reputation`, amount);
      await addActivity(redis, targetUser.id, `Received ${amount} karma from ${interaction.user.username}`);
      return interaction.reply({ content: `✅ Gave ${amount} karma to ${targetUser.username}.`, flags: MessageFlags.Ephemeral });
    }

    // ---- SETFAVGAME ----
    if (sub === "setfavgame") {
      const game = interaction.options.getString("game");
      await redis.set(`profile:${userId}:favGame`, game);
      await addActivity(redis, userId, `Set favorite game: ${game}`);
      return interaction.reply({ content: `✅ Favorite game set to ${game}.`, flags: MessageFlags.Ephemeral });
    }

    // ---- ACHIEVEMENTS ----
    if (sub === "achievements") {
      const achSet = await redis.smembers(`profile:${userId}:achievements`);
      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`${interaction.user.username}'s Achievements`)
        .setDescription(achSet.length ? achSet.map(id => {
          const ach = getAchievement(id);
          return ach ? `${ach.icon} **${ach.name}** - ${ach.desc}` : id;
        }).join('\n') : "No achievements yet.")
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ---- VIEW (default) ----
    if (sub === "view" || !sub) {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const targetId = targetUser.id;

      const profile = await redis.hgetall(`profile:${targetId}`) || {};
      const balance = Number(await redis.get(`eco:${targetId}:money`) || 0);
      const shield = Number(await redis.get(`eco:${targetId}:shield`) || 0);
      const premium = await isPremium(targetId);
      const beta = await isBeta(targetId);
      const level = Number(profile.level || 1);
      const xp = Number(profile.xp || 0);
      const bio = profile.bio || "No bio set";
      const color = profile.color || "#5865F2";
      const bg = profile.bg || null;
      const customBg = profile.custom_bg || null;
      const theme = await redis.get(`profile:${targetId}:theme`) || "default";
      const nameColor = await redis.get(`profile:${targetId}:nameColor`) || color;
      const status = await redis.get(`profile:${targetId}:status`) || "";
      const spouseId = await redis.get(`profile:${targetId}:marriedTo`);
      const friends = await redis.smembers(`profile:${targetId}:friends`) || [];
      const reputation = Number(await redis.get(`profile:${targetId}:reputation`) || 0);
      const favGame = await redis.get(`profile:${targetId}:favGame`) || "None";
      const activityFeed = await redis.lrange(`profile:${targetId}:activityFeed`, 0, 9) || [];
      const embedBg = await redis.get(`profile:${targetId}:embedBg`) || null;
      const barStyle = await redis.get(`profile:${targetId}:barStyle`) || "default";
      const achievements = await redis.smembers(`profile:${targetId}:achievements`) || [];

      const needed = Math.floor(100 * Math.pow(level, 1.6));
      const progress = Math.min(xp / needed, 1);

      // ---- Build embed ----
      const embed = new EmbedBuilder()
        .setColor(embedBg || color)
        .setTitle(`${targetUser.username}'s Profile`)
        .setDescription(`Level ${level} • ${premium ? 'Premium' : beta ? 'Beta Tester' : 'Member'}`)
        .addFields(
          { name: "💰 Coins", value: `${formatNumber(balance)}`, inline: true },
          { name: "🛡️ Shields", value: `${formatNumber(shield)}`, inline: true },
          { name: "⭐ Reputation", value: `${reputation}`, inline: true },
          { name: "📝 Status", value: status || "None", inline: false },
          { name: "🎮 Favorite Game", value: favGame, inline: true },
          { name: "💍 Spouse", value: spouseId ? `<@${spouseId}>` : "None", inline: true },
          { name: "👥 Friends", value: friends.length ? friends.map(id => `<@${id}>`).join(', ') : "None", inline: false },
          { name: "🏅 Achievements", value: achievements.length ? achievements.map(id => {
            const ach = getAchievement(id);
            return ach ? `${ach.icon}` : id;
          }).join(' ') : "None", inline: false },
          { name: "📋 Recent Activity", value: activityFeed.length ? activityFeed.slice(0, 5).join('\n') : "None", inline: false }
        )
        .setImage("attachment://profile.png")
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

      // ---- Generate canvas image ----
      const canvas = createCanvas(900, 350);
      const ctx = canvas.getContext("2d");

      // Background
      let bgImage = null;
      if (customBg) {
        try { bgImage = await loadImage(customBg); } catch {}
      }
      if (!bgImage && bg) {
        const shopData = await redis.hgetall(`shop:bg:${bg}`);
        if (shopData?.url) {
          try { bgImage = await loadImage(shopData.url); } catch {}
        }
      }
      if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, 900, 350);
      } else {
        const gradient = ctx.createLinearGradient(0, 0, 900, 350);
        gradient.addColorStop(0, color + "33");
        gradient.addColorStop(1, "#2C3E50");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 900, 350);
      }

      // Overlay
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, 900, 350);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, 0, 900, 350);

      // Avatar
      const avatar = await loadImage(targetUser.displayAvatarURL({ extension: "png", size: 256 }));
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 20;
      ctx.save();
      ctx.beginPath();
      ctx.arc(130, 145, 80, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 45, 65, 170, 170);
      ctx.restore();

      // Avatar ring
      ctx.shadowColor = color;
      ctx.shadowBlur = 30;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(130, 145, 85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Username (custom color)
      const nameColorHex = nameColor || "#FFFFFF";
      ctx.fillStyle = nameColorHex;
      ctx.font = getFont("bold", 32);
      ctx.fillText(targetUser.username, 270, 100);

      // Title
      let title = "Member";
      if (premium) title = "💎 Premium";
      else if (beta) title = "🧪 Beta Tester";
      ctx.fillStyle = color;
      ctx.font = getFont("bold", 18);
      ctx.fillText(title, 270, 140);

      // Status
      if (status) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = getFont("italic", 14);
        ctx.fillText(`"${status}"`, 270, 165);
      }

      // Bio
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = getFont("normal", 16);
      let displayBio = bio;
      if (displayBio.length > 60) displayBio = displayBio.substring(0, 57) + "...";
      ctx.fillText(displayBio, 270, status ? 195 : 175);

      // Stats
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = getFont("bold", 16);
      let xPos = 270;
      const stats = [
        { label: "Coins:", value: formatNumber(balance) },
        { label: "Shields:", value: formatNumber(shield) },
        { label: "Level:", value: level }
      ];
      stats.forEach((stat, index) => {
        if (index > 0) {
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.font = getFont("normal", 16);
          ctx.fillText("|", xPos + 20, 205);
          xPos += 40;
        }
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = getFont("bold", 16);
        ctx.fillText(stat.label, xPos, 205);
        xPos += 70;
        ctx.font = getFont("normal", 16);
        ctx.fillStyle = color;
        ctx.fillText(stat.value, xPos, 205);
        xPos += 80;
      });

      // XP Bar
      const barX = 270, barY = 240, barWidth = 540, barHeight = 22;
      ctx.shadowBlur = 5;
      ctx.shadowColor = "rgba(0,0,0,0.2)";
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth, barHeight, 11);
      ctx.fill();

      // Bar style
      let barGradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
      if (barStyle === "neon") {
        barGradient.addColorStop(0, "#00FFAA");
        barGradient.addColorStop(1, "#00AAFF");
      } else if (barStyle === "retro") {
        barGradient.addColorStop(0, "#FF6B6B");
        barGradient.addColorStop(1, "#FFD93D");
      } else if (barStyle === "minimal") {
        barGradient.addColorStop(0, "#FFFFFF");
        barGradient.addColorStop(1, "#AAAAAA");
      } else {
        barGradient.addColorStop(0, color);
        barGradient.addColorStop(1, "#FF6B6B");
      }
      ctx.fillStyle = barGradient;
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth * progress, barHeight, 11);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = getFont("bold", 14);
      ctx.textAlign = "center";
      ctx.fillText(`${formatNumber(xp)}/${formatNumber(needed)} XP`, barX + barWidth / 2, barY + 17);

      // Level badge
      ctx.textAlign = "center";
      const levelX = 780, levelY = 80;
      ctx.shadowBlur = 20;
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.arc(levelX, levelY, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(levelX, levelY, 50, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = getFont("bold", 18);
      ctx.fillText("LEVEL", levelX, levelY - 12);
      ctx.fillStyle = color;
      ctx.font = getFont("bold", 28);
      ctx.fillText(level, levelX, levelY + 22);

      // Footer
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.font = getFont("normal", 12);
      ctx.fillText(`ID: ${targetUser.id.slice(0, 8)}...`, 20, 340);
      ctx.textAlign = "right";
      ctx.fillText("Profile v2.0", 880, 340);

      const buffer = canvas.toBuffer("image/png");

      embed.setImage("attachment://profile.png");

      return interaction.reply({
        embeds: [embed],
        files: [new AttachmentBuilder(buffer, { name: "profile.png" })]
      });
    }
  }
};

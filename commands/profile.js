// commands/profile.js – with premium visuals
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

// ---------- Helpers (lowercase Redis) ----------
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
        .setDescription("Set a custom status (auto-clears after 24h)")
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
        .setDescription("Add a social link (shows on profile)")
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
        .setDescription("Friend management")
        .addStringOption(opt =>
          opt.setName("action")
            .setDescription("Action to perform")
            .setRequired(true)
            .addChoices(
              { name: "request", value: "request" },
              { name: "accept", value: "accept" },
              { name: "deny", value: "deny" },
              { name: "list", value: "list" }
            )
        )
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User for request/accept/deny")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName("givekarma")
        .setDescription("Give reputation to a user (once per 24h)")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User to give reputation")
            .setRequired(true)
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
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // ---- Helpers ----
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

    // ... (all other subcommands remain identical to the original until the VIEW section) ...

    // ---- VIEW (default) ----
    if (sub === "view" || !sub) {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const targetId = targetUser.id;

      // ---- Auto‑clear status after 24h ----
      const statusTimestamp = await redis.get(`profile:${targetId}:statusTimestamp`);
      if (statusTimestamp && (Date.now() - Number(statusTimestamp) > 24 * 60 * 60 * 1000)) {
        await redis.del(`profile:${targetId}:status`);
        await redis.del(`profile:${targetId}:statusTimestamp`);
      }

      // ---- Fetch data ----
      const profile = await redis.hgetall(`profile:${targetId}`) || {};
      const balance = Number(await redis.get(`eco:${targetId}:money`) || 0);
      const reputation = Number(await redis.get(`profile:${targetId}:reputation`) || 0);
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
      const favGame = await redis.get(`profile:${targetId}:favGame`) || "None";
      const activityFeed = await redis.lrange(`profile:${targetId}:activityFeed`, 0, 9) || [];
      const embedBg = await redis.get(`profile:${targetId}:embedBg`) || null;
      const barStyle = await redis.get(`profile:${targetId}:barStyle`) || "default";
      const achievements = await redis.smembers(`profile:${targetId}:achievements`) || [];
      const socialLinks = await redis.get(`profile:${targetId}:socialLinks`);
      const links = socialLinks ? JSON.parse(socialLinks) : [];

      const needed = Math.floor(100 * Math.pow(level, 1.6));
      const progress = Math.min(xp / needed, 1);

      // ---- Build embed ----
      const embed = new EmbedBuilder()
        .setColor(embedBg || color)
        .setTitle(`${targetUser.username}'s Profile`)
        .setDescription(`Level ${level} • ${premium ? '💎 Premium' : beta ? '🧪 Beta Tester' : 'Member'}`)
        .addFields(
          { name: "💰 Coins", value: `${formatNumber(balance)}`, inline: true },
          { name: "⭐ Reputation", value: `${reputation}`, inline: true },
          { name: "🎮 Favorite Game", value: favGame, inline: true },
          { name: "📝 Status", value: status || "None", inline: false },
          { name: "💍 Spouse", value: spouseId ? `<@${spouseId}>` : "None", inline: true },
          { name: "🔗 Social Links", value: links.length ? links.map(l => `${l.platform}: ${l.url}`).join('\n') : "None", inline: false },
          { name: "🏅 Achievements", value: achievements.length ? 
            (premium ? achievements : achievements.slice(0, 3)).map(id => {
              const ach = getAchievement(id);
              return ach ? `${ach.icon}` : id;
            }).join(' ') || "None" : "None", inline: false },
          { name: "📋 Recent Activity", value: activityFeed.length ? 
            (premium ? activityFeed.slice(0, 10) : activityFeed.slice(0, 5)).join('\n') : "None", inline: false }
        )
        .setImage("attachment://profile.png")
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

      // ---- Generate canvas image ----
      const canvas = createCanvas(900, 350);
      const ctx = canvas.getContext("2d");

      // Background (same as before)
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
        let gradColors;
        switch (theme) {
          case "neon":
            gradColors = ["#FF00FF33", "#00FFFF33"];
            break;
          case "space":
            gradColors = ["#00003333", "#33006633"];
            break;
          case "nature":
            gradColors = ["#00FF0033", "#00660033"];
            break;
          case "retro":
            gradColors = ["#FF6B6B33", "#FFD93D33"];
            break;
          default:
            gradColors = [color + "33", "#2C3E50"];
        }
        const gradient = ctx.createLinearGradient(0, 0, 900, 350);
        gradient.addColorStop(0, gradColors[0]);
        gradient.addColorStop(1, gradColors[1]);
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

      // Status below profile picture
      if (status) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = getFont("italic", 14);
        ctx.textAlign = "center";
        ctx.fillText(`"${status}"`, 130, 250);
        ctx.textAlign = "left";
      }

      // ---- Username + Premium Badge ----
      const nameColorHex = nameColor || "#FFFFFF";
      ctx.fillStyle = nameColorHex;
      ctx.font = getFont("bold", 32);
      ctx.fillText(targetUser.username, 270, 100);
      if (premium) {
        // Draw a golden crown/diamond next to name
        ctx.fillStyle = "#FFD700";
        ctx.font = getFont("bold", 24);
        ctx.fillText("💎", 270 + ctx.measureText(targetUser.username).width + 10, 100);
      }

      // ---- Title ----
      let title = "Member";
      if (premium) title = "💎 Premium";
      else if (beta) title = "🧪 Beta Tester";
      ctx.fillStyle = color;
      ctx.font = getFont("bold", 18);
      ctx.fillText(title, 270, 140);

      // Bio
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = getFont("normal", 16);
      let displayBio = bio;
      if (displayBio.length > 60) displayBio = displayBio.substring(0, 57) + "...";
      ctx.fillText(displayBio, 270, 175);

      // Stats with spacing
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = getFont("bold", 16);
      let xPos = 270;
      const stats = [
        { label: "Coins:", value: formatNumber(balance) },
        { label: "Reputation:", value: formatNumber(reputation) },
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
        xPos += 100;
        ctx.font = getFont("normal", 16);
        ctx.fillStyle = color;
        ctx.fillText(stat.value, xPos, 205);
        xPos += 100;
      });

      // Social Links
      if (links.length) {
        const linkText = links.map(l => `${l.platform}: ${l.url}`).join('  •  ');
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = getFont("normal", 12);
        ctx.fillText(linkText, 270, 225);
      }

      // XP Bar (unchanged)
      const barX = 270, barY = 240, barWidth = 540, barHeight = 22;
      ctx.shadowBlur = 5;
      ctx.shadowColor = "rgba(0,0,0,0.2)";
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth, barHeight, 11);
      ctx.fill();

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
      ctx.fillText("Profile v3.0", 880, 340);

      const buffer = canvas.toBuffer("image/png");
      embed.setImage("attachment://profile.png");

      return interaction.editReply({
        embeds: [embed],
        files: [new AttachmentBuilder(buffer, { name: "profile.png" })]
      });
    }
  }
};

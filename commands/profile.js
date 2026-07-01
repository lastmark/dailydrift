// commands/profile.js – Full Profile System (MongoDB, all subcommands, canvas + animated GIF)
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require("discord.js");
const { createCanvas, loadImage, registerFont, CanvasRenderingContext2D } = require("canvas");
const path = require("path");
const fs = require("fs");
const { formatNumber } = require("../utils.js");
const { generateAnimatedProfile } = require("../utils/animatedProfile.js");

// ---------- Font Setup ----------
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

// ---------- Achievements ----------
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

// ---------- Helper: get/set profile object ----------
async function getProfile(db, userId) {
  const data = await db.get(`profile:${userId}`);
  return data ? (typeof data === 'object' ? data : JSON.parse(data)) : {};
}

async function setProfile(db, userId, obj) {
  await db.set(`profile:${userId}`, obj);
}

module.exports = {
  category: "User",
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Manage your profile")
    .addSubcommand(sub => sub.setName("view").setDescription("View a user's profile").addUserOption(opt => opt.setName("user").setDescription("User to view")))
    .addSubcommand(sub => sub.setName("setbio").setDescription("Set your bio").addStringOption(opt => opt.setName("text").setDescription("Bio (max 200 chars)").setRequired(true).setMaxLength(200)))
    .addSubcommand(sub => sub.setName("setcolor").setDescription("Set accent color").addStringOption(opt => opt.setName("color").setDescription("Hex color (e.g., #FF6B6B)").setRequired(true)))
    .addSubcommand(sub => sub.setName("upload").setDescription("Upload custom background (premium)").addAttachmentOption(opt => opt.setName("image").setDescription("Image file").setRequired(true)))
    .addSubcommand(sub => sub.setName("reset").setDescription("Reset all profile data"))
    .addSubcommand(sub => sub.setName("setstatus").setDescription("Set a custom status (auto‑clears after 24h)").addStringOption(opt => opt.setName("status").setDescription("Status text (max 60 chars)").setRequired(true).setMaxLength(60)))
    .addSubcommand(sub => sub.setName("settheme").setDescription("Set profile theme (buy with coins)").addStringOption(opt => opt.setName("theme").setDescription("Theme name").setRequired(true).addChoices({ name: "Neon", value: "neon" }, { name: "Space", value: "space" }, { name: "Nature", value: "nature" }, { name: "Retro", value: "retro" })))
    .addSubcommand(sub => sub.setName("setbar").setDescription("Set XP bar style (buy with coins)").addStringOption(opt => opt.setName("style").setDescription("Bar style").setRequired(true).addChoices({ name: "Neon", value: "neon" }, { name: "Retro", value: "retro" }, { name: "Minimal", value: "minimal" })))
    .addSubcommand(sub => sub.setName("setembedbg").setDescription("Set embed background color (premium)").addStringOption(opt => opt.setName("color").setDescription("Hex color").setRequired(true)))
    .addSubcommand(sub => sub.setName("link").setDescription("Add a social link").addStringOption(opt => opt.setName("platform").setDescription("Platform name").setRequired(true).addChoices({ name: "Twitter", value: "twitter" }, { name: "Instagram", value: "instagram" }, { name: "GitHub", value: "github" }, { name: "YouTube", value: "youtube" }, { name: "Twitch", value: "twitch" })).addStringOption(opt => opt.setName("url").setDescription("URL").setRequired(true)).addBooleanOption(opt => opt.setName("remove").setDescription("Remove this link").setRequired(false)))
    .addSubcommand(sub => sub.setName("marry").setDescription("Marry another user").addUserOption(opt => opt.setName("user").setDescription("User to marry").setRequired(true)))
    .addSubcommand(sub => sub.setName("divorce").setDescription("Divorce your spouse"))
    .addSubcommand(sub => sub.setName("friend").setDescription("Friend management").addStringOption(opt => opt.setName("action").setDescription("Action to perform").setRequired(true).addChoices({ name: "request", value: "request" }, { name: "accept", value: "accept" }, { name: "deny", value: "deny" }, { name: "list", value: "list" })).addUserOption(opt => opt.setName("user").setDescription("User for request/accept/deny").setRequired(false)))
    .addSubcommand(sub => sub.setName("givekarma").setDescription("Give reputation to a user (once per 24h)").addUserOption(opt => opt.setName("user").setDescription("User to give reputation").setRequired(true)))
    .addSubcommand(sub => sub.setName("setfavgame").setDescription("Set your favorite game").addStringOption(opt => opt.setName("game").setDescription("Game name").setRequired(true).addChoices({ name: "Blackjack", value: "blackjack" }, { name: "Slots", value: "slots" }, { name: "RPS", value: "rps" }, { name: "Coinflip", value: "coinflip" }, { name: "Dice", value: "dice" }, { name: "Counting", value: "counting" })))
    .addSubcommand(sub => sub.setName("achievements").setDescription("View your achievements")),

  async execute(interaction, client, db) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    const getBalance = async (id) => Number(await db.get(`eco:${id}:money`) || 0);
    const updateBalance = async (id, delta) => {
      const cur = await getBalance(id);
      await db.set(`eco:${id}:money`, cur + delta);
    };
    const isPremium = async (id) => (await db.get(`premium:user:${id}`)) !== null;

    // ---- SETBIO ----
    if (sub === "setbio") {
      const text = interaction.options.getString("text");
      const prof = await getProfile(db, userId);
      prof.bio = text;
      await setProfile(db, userId, prof);
      return interaction.editReply({ content: "✅ Bio updated.", flags: MessageFlags.Ephemeral });
    }

    // ---- SETCOLOR ----
    if (sub === "setcolor") {
      let color = interaction.options.getString("color");
      if (!color.startsWith("#")) color = `#${color}`;
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        return interaction.editReply({ content: "❌ Invalid hex color.", flags: MessageFlags.Ephemeral });
      }
      const prof = await getProfile(db, userId);
      prof.color = color;
      await setProfile(db, userId, prof);
      return interaction.editReply({ content: "✅ Color updated.", flags: MessageFlags.Ephemeral });
    }

    // ---- UPLOAD (premium) ----
    if (sub === "upload") {
      if (!(await isPremium(userId))) {
        return interaction.editReply({ content: "❌ Premium only.", flags: MessageFlags.Ephemeral });
      }
      const attachment = interaction.options.getAttachment("image");
      if (!attachment.contentType?.startsWith("image/")) {
        return interaction.editReply({ content: "❌ Invalid image.", flags: MessageFlags.Ephemeral });
      }
      const prof = await getProfile(db, userId);
      prof.custom_bg = attachment.url;
      await setProfile(db, userId, prof);
      return interaction.editReply({ content: "✅ Background uploaded.", flags: MessageFlags.Ephemeral });
    }

    // ---- RESET ----
    if (sub === "reset") {
      await db.del(`profile:${userId}`);
      return interaction.editReply({ content: "✅ Profile reset.", flags: MessageFlags.Ephemeral });
    }

    // ---- SETSTATUS ----
    if (sub === "setstatus") {
      const status = interaction.options.getString("status");
      const prof = await getProfile(db, userId);
      prof.status = status;
      prof.statusTimestamp = Date.now();
      await setProfile(db, userId, prof);
      return interaction.editReply({ content: "✅ Status set (auto‑clears after 24h).", flags: MessageFlags.Ephemeral });
    }

    // ---- SETTHEME ----
    if (sub === "settheme") {
      const theme = interaction.options.getString("theme");
      const bal = await getBalance(userId);
      if (bal < 500) return interaction.editReply({ content: "❌ You need 500 coins.", flags: MessageFlags.Ephemeral });
      await updateBalance(userId, -500);
      const prof = await getProfile(db, userId);
      prof.theme = theme;
      await setProfile(db, userId, prof);
      return interaction.editReply({ content: `✅ Theme set to ${theme}.`, flags: MessageFlags.Ephemeral });
    }

    // ---- SETBAR ----
    if (sub === "setbar") {
      const style = interaction.options.getString("style");
      const bal = await getBalance(userId);
      if (bal < 300) return interaction.editReply({ content: "❌ You need 300 coins.", flags: MessageFlags.Ephemeral });
      await updateBalance(userId, -300);
      const prof = await getProfile(db, userId);
      prof.barStyle = style;
      await setProfile(db, userId, prof);
      return interaction.editReply({ content: `✅ Bar style set to ${style}.`, flags: MessageFlags.Ephemeral });
    }

    // ---- SETEMBEDBG ----
    if (sub === "setembedbg") {
      if (!(await isPremium(userId))) return interaction.editReply({ content: "❌ Premium only.", flags: MessageFlags.Ephemeral });
      let color = interaction.options.getString("color");
      if (!color.startsWith("#")) color = `#${color}`;
      if (!/^#[0-9A-F]{6}$/i.test(color)) return interaction.editReply({ content: "❌ Invalid hex color.", flags: MessageFlags.Ephemeral });
      const prof = await getProfile(db, userId);
      prof.embedBg = color;
      await setProfile(db, userId, prof);
      return interaction.editReply({ content: "✅ Embed background updated.", flags: MessageFlags.Ephemeral });
    }

    // ---- LINK ----
    if (sub === "link") {
      const platform = interaction.options.getString("platform");
      const url = interaction.options.getString("url");
      const remove = interaction.options.getBoolean("remove") || false;
      const prof = await getProfile(db, userId);
      let links = prof.socialLinks || [];
      if (remove) {
        links = links.filter(l => l.platform !== platform);
      } else {
        if (!(await isPremium(userId)) && links.length >= 1) {
          return interaction.editReply({ content: "❌ Premium needed for more than 1 link.", flags: MessageFlags.Ephemeral });
        }
        links.push({ platform, url });
      }
      prof.socialLinks = links;
      await setProfile(db, userId, prof);
      return interaction.editReply({ content: remove ? `✅ Removed ${platform} link.` : `✅ Added ${platform} link.`, flags: MessageFlags.Ephemeral });
    }

    // ---- MARRY ----
    if (sub === "marry") {
      const target = interaction.options.getUser("user");
      if (target.id === userId) return interaction.editReply({ content: "❌ Cannot marry yourself.", flags: MessageFlags.Ephemeral });
      if (await db.get(`marry:${userId}`)) return interaction.editReply({ content: "❌ Already married.", flags: MessageFlags.Ephemeral });
      if (await db.get(`marry:${target.id}`)) return interaction.editReply({ content: `❌ ${target.username} is already married.`, flags: MessageFlags.Ephemeral });
      return interaction.editReply({ content: "💍 Proposal sent! (reaction collector needed)", flags: MessageFlags.Ephemeral });
    }

    // ---- DIVORCE ----
    if (sub === "divorce") {
      const spouse = await db.get(`marry:${userId}`);
      if (!spouse) return interaction.editReply({ content: "❌ You are not married.", flags: MessageFlags.Ephemeral });
      await db.del(`marry:${userId}`);
      await db.del(`marry:${spouse}`);
      return interaction.editReply({ content: "💔 You are now divorced.", flags: MessageFlags.Ephemeral });
    }

    // ---- FRIEND ----
    if (sub === "friend") {
      const action = interaction.options.getString("action");
      const targetUser = interaction.options.getUser("user");

      if (action === "list") {
        const prof = await getProfile(db, userId);
        const friends = prof.friends || [];
        if (!friends.length) return interaction.editReply({ content: "📭 You have no friends.", flags: MessageFlags.Ephemeral });
        const names = await Promise.all(friends.map(async id => {
          const user = await client.users.fetch(id).catch(() => null);
          return user ? user.username : "Unknown";
        }));
        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle(`👥 ${interaction.user.username}'s Friends`)
          .setDescription(names.map((name, i) => `${i+1}. ${name}`).join('\n'))
          .setTimestamp();
        return interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (!targetUser) return interaction.editReply({ content: "❌ Please specify a user.", flags: MessageFlags.Ephemeral });
      const targetId = targetUser.id;
      if (targetId === userId) return interaction.editReply({ content: "❌ Can't friend yourself.", flags: MessageFlags.Ephemeral });

      let prof = await getProfile(db, userId);
      let friends = prof.friends || [];
      let requests = prof.friendRequests || [];
      let targetProf = await getProfile(db, targetId);
      let incoming = targetProf.friendRequestsIncoming || [];

      if (action === "request") {
        if (friends.includes(targetId)) return interaction.editReply({ content: "❌ Already friends.", flags: MessageFlags.Ephemeral });
        if (requests.includes(targetId)) return interaction.editReply({ content: "❌ Request already sent.", flags: MessageFlags.Ephemeral });
        requests.push(targetId);
        incoming.push(userId);
        prof.friendRequests = requests;
        targetProf.friendRequestsIncoming = incoming;
        await setProfile(db, userId, prof);
        await setProfile(db, targetId, targetProf);
        return interaction.editReply({ content: `✅ Friend request sent to ${targetUser.username}.`, flags: MessageFlags.Ephemeral });
      }

      if (action === "accept") {
        if (!incoming.includes(userId)) return interaction.editReply({ content: `❌ No request from ${targetUser.username}.`, flags: MessageFlags.Ephemeral });
        friends.push(targetId);
        let targetFriends = targetProf.friends || [];
        targetFriends.push(userId);
        prof.friends = friends;
        targetProf.friends = targetFriends;
        prof.friendRequests = requests.filter(id => id !== targetId);
        targetProf.friendRequestsIncoming = incoming.filter(id => id !== userId);
        await setProfile(db, userId, prof);
        await setProfile(db, targetId, targetProf);
        return interaction.editReply({ content: `✅ You are now friends with ${targetUser.username}.`, flags: MessageFlags.Ephemeral });
      }

      if (action === "deny") {
        if (!incoming.includes(userId)) return interaction.editReply({ content: `❌ No request from ${targetUser.username}.`, flags: MessageFlags.Ephemeral });
        targetProf.friendRequestsIncoming = incoming.filter(id => id !== userId);
        prof.friendRequests = requests.filter(id => id !== targetId);
        await setProfile(db, userId, prof);
        await setProfile(db, targetId, targetProf);
        return interaction.editReply({ content: `✅ Request denied.`, flags: MessageFlags.Ephemeral });
      }
    }

    // ---- GIVEKARMA ----
    if (sub === "givekarma") {
      const target = interaction.options.getUser("user");
      if (target.id === userId) return interaction.editReply({ content: "❌ Cannot give yourself reputation.", flags: MessageFlags.Ephemeral });
      const key = `profile:${userId}:lastRepGiven`;
      const last = await db.get(key);
      if (last && Date.now() - last < 86400000) {
        const remaining = Math.ceil((86400000 - (Date.now() - last)) / 60000);
        return interaction.editReply({ content: `⏳ You can give reputation again in ${remaining} minutes.`, flags: MessageFlags.Ephemeral });
      }
      await db.set(key, Date.now());
      let targetProf = await getProfile(db, target.id);
      targetProf.reputation = (targetProf.reputation || 0) + 1;
      await setProfile(db, target.id, targetProf);
      return interaction.editReply({ content: `✅ Gave 1 reputation to ${target.username}.`, flags: MessageFlags.Ephemeral });
    }

    // ---- SETFAVGAME ----
    if (sub === "setfavgame") {
      const game = interaction.options.getString("game");
      const prof = await getProfile(db, userId);
      prof.favGame = game;
      await setProfile(db, userId, prof);
      return interaction.editReply({ content: `✅ Favorite game set to ${game}.`, flags: MessageFlags.Ephemeral });
    }

    // ---- ACHIEVEMENTS ----
    if (sub === "achievements") {
      const prof = await getProfile(db, userId);
      const achSet = prof.achievements || [];
      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`${interaction.user.username}'s Achievements`)
        .setDescription(achSet.length ? achSet.map(id => {
          const ach = getAchievement(id);
          return ach ? `${ach.icon} **${ach.name}** - ${ach.desc}` : id;
        }).join('\n') : "No achievements yet.");
      return interaction.editReply({ embeds: [embed] });
    }

    // ---- VIEW (default) ----
    if (sub === "view" || !sub) {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const targetId = targetUser.id;

      const prof = await getProfile(db, targetId);
      const balance = await getBalance(targetId);
      const premium = await isPremium(targetId);
      const beta = await db.get(`beta:user:${targetId}`) === "true";
      const level = Number(prof.level || 1);
      const xp = Number(prof.xp || 0);
      const bio = prof.bio || "No bio set";
      const color = prof.color || "#5865F2";
      const customBg = prof.custom_bg || null;
      const theme = prof.theme || "default";
      const nameColor = prof.nameColor || color;
      const status = prof.status || "";
      const spouseId = await db.get(`marry:${targetId}`) || null;
      const favGame = prof.favGame || "None";
      const embedBg = prof.embedBg || null;
      const barStyle = prof.barStyle || "default";
      const achievements = prof.achievements || [];
      const links = prof.socialLinks || [];
      const reputation = prof.reputation || 0;

      const needed = Math.floor(100 * Math.pow(level, 1.6));
      const progress = Math.min(xp / needed, 1);

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
          { name: "🏅 Achievements", value: achievements.length ? (premium ? achievements : achievements.slice(0, 3)).map(id => getAchievement(id)?.icon || id).join(' ') : "None", inline: false }
        )
        .setImage("attachment://profile.png")
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

      // ── Decide: Animated GIF or Static PNG ──
      let profileBuffer;
      let attachmentName = "profile.png";

      // Robust GIF check (ignores query parameters)
      const isGif = customBg && customBg.toLowerCase().split('?')[0].endsWith('.gif');

      if (premium && customBg && isGif) {
        console.log("[PROFILE] Attempting animated GIF generation...");
        try {
          const profileData = {
            avatarUrl: targetUser.displayAvatarURL({ extension: "png", size: 256 }),
            username: targetUser.username,
            color,
            theme,
            premium: true,
            beta,
            bio,
            status,
            balance,
            reputation,
            level,
            xp,
            needed,
            progress,
            barStyle,
            links,
            nameColor,
            favGame,
            embedBg,
            userId: targetId,
          };
          profileBuffer = await generateAnimatedProfile(customBg, profileData);
          attachmentName = "profile.gif";
          console.log("[PROFILE] Animated GIF generated successfully.");
        } catch (err) {
          console.error("[PROFILE] Animated GIF failed, using static:", err.message);
          profileBuffer = null;
        }
      }

      // If no animated buffer, generate static canvas
      if (!profileBuffer) {
        const canvas = createCanvas(900, 350);
        const ctx = canvas.getContext("2d");

        // Background
        let bgImage = null;
        if (customBg) {
          try { bgImage = await loadImage(customBg); } catch {}
        }
        if (!bgImage && prof.bg) {
          const shopData = await db.get(`shop:bg:${prof.bg}`);
          if (shopData?.url) {
            try { bgImage = await loadImage(shopData.url); } catch {}
          }
        }
        if (bgImage) {
          ctx.drawImage(bgImage, 0, 0, 900, 350);
        } else {
          let gradColors;
          switch (theme) {
            case "neon": gradColors = ["#FF00FF33", "#00FFFF33"]; break;
            case "space": gradColors = ["#00003333", "#33006633"]; break;
            case "nature": gradColors = ["#00FF0033", "#00660033"]; break;
            case "retro": gradColors = ["#FF6B6B33", "#FFD93D33"]; break;
            default: gradColors = [color + "33", "#2C3E50"];
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

        ctx.shadowColor = color;
        ctx.shadowBlur = 30;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(130, 145, 85, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (status) {
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.font = getFont("italic", 14);
          ctx.textAlign = "center";
          ctx.fillText(`"${status}"`, 130, 250);
          ctx.textAlign = "left";
        }

        const nameColorHex = nameColor || "#FFFFFF";
        ctx.fillStyle = nameColorHex;
        ctx.font = getFont("bold", 32);
        const nameWidth = ctx.measureText(targetUser.username).width;
        ctx.fillText(targetUser.username, 270, 100);
        if (premium) {
          ctx.fillStyle = "#FFD700";
          ctx.font = getFont("bold", 18);
          ctx.fillText("PREMIUM", 270 + nameWidth + 15, 100);
        }

        let title = "Member";
        if (premium) title = "PREMIUM";
        else if (beta) title = "Beta Tester";
        ctx.fillStyle = color;
        ctx.font = getFont("bold", 18);
        ctx.fillText(title, 270, 140);

        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = getFont("normal", 16);
        let displayBio = bio.length > 60 ? bio.substring(0, 57) + "..." : bio;
        ctx.fillText(displayBio, 270, 175);

        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = getFont("bold", 16);
        let xPos = 270;
        const stats = [
          { label: "Coins:", value: formatNumber(balance) },
          { label: "Reputation:", value: formatNumber(reputation) },
          { label: "Level:", value: level }
        ];
        stats.forEach((stat, i) => {
          if (i > 0) {
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

        if (links.length) {
          const linkText = links.map(l => `${l.platform}: ${l.url}`).join('  •  ');
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.font = getFont("normal", 12);
          ctx.fillText(linkText, 270, 225);
        }

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

        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = getFont("normal", 12);
        ctx.fillText(`ID: ${targetId.slice(0, 8)}...`, 20, 340);
        ctx.textAlign = "right";
        ctx.fillText("Profile v2.0", 880, 340);

        profileBuffer = canvas.toBuffer("image/png");
      }

      embed.setImage(`attachment://${attachmentName}`);

      return interaction.editReply({
        embeds: [embed],
        files: [new AttachmentBuilder(profileBuffer, { name: attachmentName })]
      });
    }
  }
};

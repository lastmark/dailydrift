// commands/profile.js – FULL WITH ALL SUBCOMMANDS
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require("discord.js");
const { createCanvas, loadImage, CanvasRenderingContext2D, registerFont } = require("canvas");
const path = require("path");
const fs = require("fs");

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
  return `${weight} ${size}px ${family}`;
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

module.exports = {
  category: "User",

  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Manage your profile")
    .addSubcommand(sub =>
      sub.setName("view")
        .setDescription("View a user's profile")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User to view")
        )
    )
    .addSubcommand(sub =>
      sub.setName("setbio")
        .setDescription("Set your profile bio")
        .addStringOption(opt =>
          opt.setName("text")
            .setDescription("Your bio (max 200 characters)")
            .setRequired(true)
            .setMaxLength(200)
        )
    )
    .addSubcommand(sub =>
      sub.setName("setcolor")
        .setDescription("Set your profile accent color")
        .addStringOption(opt =>
          opt.setName("color")
            .setDescription("Hex color code (e.g., #FF6B6B)")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("upload")
        .setDescription("Upload a custom background (premium only)")
        .addAttachmentOption(opt =>
          opt.setName("image")
            .setDescription("Image file (PNG/JPG)")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("reset")
        .setDescription("Reset your profile data")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const user = interaction.user;

    // ---------- HELPERS ----------
    const getBalance = async (id) => Number(await redis.get(`eco:${id}:money`) || 0);
    const getShield = async (id) => Number(await redis.get(`eco:${id}:shield`) || 0);
    const isPremium = async (id) => {
      const val = await redis.get(`premium:user:${id}`);
      return val !== null && val !== undefined;
    };

    // =========================
    // 📝 SETBIO
    // =========================
    if (sub === "setbio") {
      const text = interaction.options.getString("text");
      await redis.hset(`profile:${userId}`, "bio", text);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00D4FF")
            .setTitle("✅ Bio Updated")
            .setDescription(`> ${text}`)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // =========================
    // 🎨 SETCOLOR
    // =========================
    if (sub === "setcolor") {
      let color = interaction.options.getString("color");
      if (!color.startsWith("#")) color = `#${color}`;
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        return interaction.reply({
          content: "❌ Invalid hex color. Use format `#FF6B6B`.",
          flags: MessageFlags.Ephemeral
        });
      }
      await redis.hset(`profile:${userId}`, "color", color);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle("✅ Color Updated")
            .setDescription(`Your accent color is now ${color}`)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // =========================
    // 🖼️ UPLOAD (premium only)
    // =========================
    if (sub === "upload") {
      const premium = await isPremium(userId);
      if (!premium) {
        return interaction.reply({
          content: "❌ This feature is for **Premium** members only. Use `/redeem` to activate premium.",
          flags: MessageFlags.Ephemeral
        });
      }

      const attachment = interaction.options.getAttachment("image");
      if (!attachment.contentType?.startsWith("image/")) {
        return interaction.reply({
          content: "❌ Please upload a valid image file.",
          flags: MessageFlags.Ephemeral
        });
      }

      await redis.hset(`profile:${userId}`, "custom_bg", attachment.url);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FFD700")
            .setTitle("✅ Custom Background Uploaded")
            .setDescription("Your premium background is now saved.")
            .setImage(attachment.url)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // =========================
    // 🔄 RESET (with confirmation)
    // =========================
    if (sub === "reset") {
      const confirmEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("⚠️ Confirm Reset")
        .setDescription("This will delete your profile data. Are you sure?")
        .setFooter({ text: "Type `confirm` in the next 30 seconds." });

      await interaction.reply({ embeds: [confirmEmbed], flags: MessageFlags.Ephemeral });

      try {
        const collected = await interaction.channel.awaitMessages({
          filter: m => m.author.id === userId && m.content.toLowerCase() === "confirm",
          max: 1,
          time: 30000,
          errors: ['time']
        });
        if (collected.size > 0) {
          await redis.del(`profile:${userId}`);
          return interaction.editReply({
            content: "✅ Your profile has been reset."
          });
        }
      } catch {
        return interaction.editReply({
          content: "❌ Reset cancelled – no confirmation received."
        });
      }
    }

    // =========================
    // 👤 VIEW (default)
    // =========================
    if (sub === "view" || !sub) {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const targetId = targetUser.id;

      const profile = await redis.hgetall(`profile:${targetId}`) || {};
      const balance = await getBalance(targetId);
      const shield = await getShield(targetId);
      const premium = await isPremium(targetId);

      const level = Number(profile.level || 1);
      const xp = Number(profile.xp || 0);
      const bio = profile.bio || "No bio set";
      const color = profile.color || "#5865F2";
      const bg = profile.bg || null;
      const customBg = profile.custom_bg || null;

      const needed = Math.floor(100 * Math.pow(level, 1.6));
      const progress = Math.min(xp / needed, 1);

      // ---- CANVAS ----
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

      // ---- TEXT ----
      ctx.fillStyle = "#FFFFFF";
      ctx.font = getFont("bold", 32);
      ctx.fillText(targetUser.username, 270, 100);

      let title = "Member";
      if (premium) title = "Premium";
      if (targetId === "1303357369622990889") title = "Developer";

      ctx.fillStyle = color;
      ctx.font = getFont("bold", 18);
      ctx.fillText(title, 270, 140);

      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = getFont("normal", 16);
      let displayBio = bio;
      if (displayBio.length > 60) displayBio = displayBio.substring(0, 57) + "...";
      ctx.fillText(displayBio, 270, 175);

      // Stats
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = getFont("bold", 16);
      let xPos = 270;
      const stats = [
        { label: "Coins:", value: balance },
        { label: "Shields:", value: shield },
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

      const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "#FF6B6B");
      ctx.fillStyle = gradient;
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth * progress, barHeight, 11);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = getFont("bold", 14);
      ctx.textAlign = "center";
      ctx.fillText(`${xp}/${needed} XP`, barX + barWidth / 2, barY + 17);

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

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${targetUser.username}'s Profile`)
        .setDescription(`Level ${level} • ${title}`)
        .addFields(
          { name: "Coins", value: `${balance}`, inline: true },
          { name: "Shields", value: `${shield}`, inline: true },
          { name: "Progress", value: `${Math.round(progress * 100)}% to next level`, inline: true }
        )
        .setImage("attachment://profile.png")
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        files: [new AttachmentBuilder(buffer, { name: "profile.png" })]
      });
    }
  }
};

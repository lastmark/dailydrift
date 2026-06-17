const { SlashCommandBuilder, AttachmentBuilder, MessageFlags, EmbedBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");
const fs = require("fs");

const fontPath = path.join(__dirname, "../font.ttf");

try {
  if (fs.existsSync(fontPath)) {
    GlobalFonts.registerFromPath(fontPath, "CustomFont");
  }
} catch {}

// Utility functions for gradients and styling
const createGradient = (ctx, x, y, w, h, colors) => {
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  colors.forEach((color, index) => {
    gradient.addColorStop(index / (colors.length - 1), color);
  });
  return gradient;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("✨ Complete profile & social system")

    // ================= PROFILE =================
    .addSubcommand(s =>
      s.setName("view")
        .setDescription("👤 View user profile")
        .addUserOption(o =>
          o.setName("target")
            .setDescription("User to view")
        )
        .addBooleanOption(o =>
          o.setName("public")
            .setDescription("Show public profile (hide stats)")
        )
    )

    .addSubcommand(s =>
      s.setName("setbio")
        .setDescription("📝 Set your bio")
        .addStringOption(o =>
          o.setName("text")
            .setDescription("Your bio (max 200 chars)")
            .setRequired(true)
            .setMaxLength(200)
        )
    )

    .addSubcommand(s =>
      s.setName("setcolor")
        .setDescription("🎨 Set your profile accent color")
        .addStringOption(o =>
          o.setName("color")
            .setDescription("Hex color code (e.g., #FF6B6B)")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("upload")
        .setDescription("🖼️ Upload premium background (VIP only)")
        .addAttachmentOption(o =>
          o.setName("image")
            .setDescription("Image file")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("reset")
        .setDescription("🔄 Reset your profile")
    )

    // ================= SHOP =================
    .addSubcommand(s =>
      s.setName("shop")
        .setDescription("🛒 Browse background shop")
        .addStringOption(o =>
          o.setName("category")
            .setDescription("Filter by category")
            .addChoices(
              { name: "🌟 All", value: "all" },
              { name: "🎆 Premium", value: "premium" },
              { name: "🌌 Space", value: "space" },
              { name: "🏰 Fantasy", value: "fantasy" },
              { name: "🌊 Nature", value: "nature" }
            )
        )
    )

    .addSubcommand(s =>
      s.setName("buybg")
        .setDescription("💳 Purchase background")
        .addStringOption(o =>
          o.setName("id")
            .setDescription("Background ID")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("equipbg")
        .setDescription("⚔️ Equip background")
        .addStringOption(o =>
          o.setName("id")
            .setDescription("Background ID")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("backgrounds")
        .setDescription("🎨 View your owned backgrounds")
    )

    // ================= ADMIN =================
    .addSubcommand(s =>
      s.setName("addbg")
        .setDescription("👑 Admin: Add background to shop")
        .addStringOption(o =>
          o.setName("id")
            .setDescription("Background ID")
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName("name")
            .setDescription("Display name")
            .setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("price")
            .setDescription("Price in coins")
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(o =>
          o.setName("category")
            .setDescription("Category")
            .setRequired(true)
            .addChoices(
              { name: "Premium", value: "premium" },
              { name: "Space", value: "space" },
              { name: "Fantasy", value: "fantasy" },
              { name: "Nature", value: "nature" }
            )
        )
        .addAttachmentOption(o =>
          o.setName("image")
            .setDescription("Background image")
            .setRequired(true)
        )
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("target") || interaction.user;
    const userId = user.id;
    const isPublic = interaction.options.getBoolean("public") || false;

    const DEV_ID = "1303357369622990889";
    const VIP_ROLE_ID = "YOUR_VIP_ROLE_ID"; // Set your VIP role ID

    // ================= DATABASE HELPERS =================
    const profile = (await redis.hgetall(`profile:${userId}`)) || {};
    
    const getBal = async () => Number(await redis.get(`eco:${userId}:money`) || 0);
    const getLevel = async () => {
      const xp = Number(profile.xp || 0);
      const level = Number(profile.level || 1);
      const needed = 100 * level;
      return { level, xp, needed, progress: Math.min(xp / needed, 1) };
    };

    // Check VIP status
    const isVIP = async () => {
      if (userId === DEV_ID) return true;
      try {
        const member = await interaction.guild.members.fetch(userId);
        return member.roles.cache.has(VIP_ROLE_ID);
      } catch { return false; }
    };

    // ================= SUBCOMMAND HANDLERS =================

    // ----- SET BIO -----
    if (sub === "setbio") {
      const text = interaction.options.getString("text");
      await redis.hset(`profile:${interaction.user.id}`, "bio", text);
      
      const embed = new EmbedBuilder()
        .setColor("#00D4FF")
        .setTitle("✅ Bio Updated")
        .setDescription(`> ${text}`)
        .setFooter({ text: "Your profile has been updated!" })
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    }

    // ----- SET COLOR -----
    if (sub === "setcolor") {
      let color = interaction.options.getString("color");
      if (!color.startsWith("#")) color = `#${color}`;
      
      // Validate hex color
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        return interaction.editReply("❌ Invalid color format. Use hex code like `#FF6B6B`");
      }
      
      await redis.hset(`profile:${interaction.user.id}`, "color", color);
      
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("🎨 Color Updated")
        .setDescription(`Your accent color is now ${color}`)
        .setFooter({ text: "Your profile will now use this color!" })
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    }

    // ----- UPLOAD PREMIUM BG -----
    if (sub === "upload") {
      const vip = await isVIP();
      if (!vip) {
        return interaction.editReply("❌ This feature is for VIP members only!");
      }
      
      const file = interaction.options.getAttachment("image");
      if (!file.contentType?.startsWith("image/")) {
        return interaction.editReply("❌ Please upload a valid image file.");
      }
      
      await redis.hset(`profile:${interaction.user.id}`, "custom_bg", file.url);
      
      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("🖼️ Premium Background Uploaded")
        .setDescription("Your custom background has been saved!")
        .setImage(file.url)
        .setFooter({ text: "You can now equip it using /profile equipbg" })
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    }

    // ----- RESET -----
    if (sub === "reset") {
      const confirm = await interaction.editReply({
        content: "⚠️ Are you sure you want to reset your profile? This action cannot be undone!\nReact with ✅ within 30 seconds to confirm.",
        flags: MessageFlags.Ephemeral
      });
      
      // Simple confirmation using reaction collector
      try {
        await confirm.react("✅");
        const filter = (reaction, user) => 
          reaction.emoji.name === "✅" && user.id === interaction.user.id;
        const collected = await confirm.awaitReactions({ 
          filter, 
          max: 1, 
          time: 30000 
        });
        
        if (collected.size > 0) {
          await redis.del(`profile:${interaction.user.id}`);
          await interaction.editReply({
            content: "✅ Profile has been reset successfully!",
            embeds: [],
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.editReply({
            content: "❌ Reset cancelled.",
            flags: MessageFlags.Ephemeral
          });
        }
      } catch {
        await interaction.editReply({
          content: "❌ Reset cancelled or timed out.",
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    // ----- SHOP -----
    if (sub === "shop") {
      const category = interaction.options.getString("category") || "all";
      const keys = await redis.keys("shop:bg:*");
      
      if (!keys.length) {
        return interaction.editReply("🛒 The shop is currently empty. Check back later!");
      }
      
      const items = [];
      for (const key of keys) {
        const id = key.split(":")[2];
        const item = await redis.hgetall(key);
        if (category === "all" || item.category === category) {
          items.push({ id, ...item });
        }
      }
      
      if (!items.length) {
        return interaction.editReply(`❌ No backgrounds found in category: ${category}`);
      }
      
      const embed = new EmbedBuilder()
        .setColor("#FF6B6B")
        .setTitle(`🛒 Background Shop ${category !== "all" ? `- ${category}` : ""}`)
        .setDescription(`💰 Your balance: **${await getBal()}** coins\nUse \`/profile buybg <id>\` to purchase`)
        .setFooter({ text: `Showing ${items.length} backgrounds` })
        .setTimestamp();
      
      items.slice(0, 10).forEach((item, index) => {
        embed.addFields({
          name: `${index + 1}. 🎨 ${item.name || item.id}`,
          value: `ID: \`${item.id}\`\n💰 Price: **${item.price}** coins\n🏷️ Category: ${item.category || "General"}`,
          inline: true
        });
      });
      
      return interaction.editReply({ embeds: [embed] });
    }

    // ----- BUY BG -----
    if (sub === "buybg") {
      const id = interaction.options.getString("id");
      const item = await redis.hgetall(`shop:bg:${id}`);
      
      if (!item?.price) {
        return interaction.editReply("❌ Invalid background ID. Check `/profile shop` for available backgrounds.");
      }
      
      const bal = await getBal();
      const price = Number(item.price);
      
      if (bal < price) {
        const embed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("❌ Insufficient Funds")
          .setDescription(`You need **${price - bal}** more coins to purchase this background.`)
          .addFields(
            { name: "Your Balance", value: `💰 ${bal} coins`, inline: true },
            { name: "Price", value: `💰 ${price} coins`, inline: true }
          )
          .setFooter({ text: "Earn coins by being active in the server!" })
          .setTimestamp();
        
        return interaction.editReply({ embeds: [embed] });
      }
      
      await redis.decrby(`eco:${interaction.user.id}:money`, price);
      await redis.sadd(`bg:owned:${interaction.user.id}`, id);
      await redis.hset(`profile:${interaction.user.id}`, "bg", id);
      
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("✅ Background Purchased!")
        .setDescription(`You successfully purchased **${item.name || id}**!`)
        .addFields(
          { name: "Price", value: `💰 ${price} coins`, inline: true },
          { name: "Remaining Balance", value: `💰 ${await getBal()} coins`, inline: true }
        )
        .setFooter({ text: "The background has been automatically equipped!" })
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    }

    // ----- EQUIP BG -----
    if (sub === "equipbg") {
      const id = interaction.options.getString("id");
      const owned = await redis.sismember(`bg:owned:${userId}`, id);
      
      if (!owned) {
        return interaction.editReply("❌ You don't own this background. Buy it first using `/profile buybg`");
      }
      
      await redis.hset(`profile:${userId}`, "bg", id);
      
      const embed = new EmbedBuilder()
        .setColor("#00D4FF")
        .setTitle("⚔️ Background Equipped")
        .setDescription(`You equipped background **${id}**!`)
        .setFooter({ text: "Your profile has been updated" })
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    }

    // ----- BACKGROUNDS (owned) -----
    if (sub === "backgrounds") {
      const owned = await redis.smembers(`bg:owned:${userId}`);
      
      if (!owned.length) {
        return interaction.editReply("🎨 You don't own any backgrounds. Visit the shop using `/profile shop`!");
      }
      
      const embed = new EmbedBuilder()
        .setColor("#9B59B6")
        .setTitle(`🎨 ${user.username}'s Backgrounds`)
        .setDescription(`You own **${owned.length}** background${owned.length > 1 ? "s" : ""}`)
        .setFooter({ text: "Use /profile equipbg <id> to equip a background" })
        .setTimestamp();
      
      // Get background details
      const bgDetails = [];
      for (const id of owned) {
        const shopItem = await redis.hgetall(`shop:bg:${id}`);
        bgDetails.push({
          id,
          name: shopItem?.name || id,
          equipped: profile.bg === id ? "✅" : "⬜"
        });
      }
      
      bgDetails.slice(0, 25).forEach(bg => {
        embed.addFields({
          name: `${bg.equipped} ${bg.name}`,
          value: `ID: \`${bg.id}\``,
          inline: true
        });
      });
      
      return interaction.editReply({ embeds: [embed] });
    }

    // ----- ADMIN ADD BG -----
    if (sub === "addbg") {
      if (userId !== DEV_ID) {
        return interaction.editReply("👑 This command is for developers only.");
      }
      
      const id = interaction.options.getString("id");
      const name = interaction.options.getString("name");
      const price = interaction.options.getInteger("price");
      const category = interaction.options.getString("category");
      const file = interaction.options.getAttachment("image");
      
      if (!file.contentType?.startsWith("image/")) {
        return interaction.editReply("❌ Please upload a valid image file.");
      }
      
      await redis.hset(`shop:bg:${id}`, {
        name: name,
        price: price.toString(),
        url: file.url,
        category: category
      });
      
      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("✅ Background Added to Shop")
        .setDescription(`**${name}** has been added to the shop!`)
        .addFields(
          { name: "ID", value: id, inline: true },
          { name: "Price", value: `${price} coins`, inline: true },
          { name: "Category", value: category, inline: true }
        )
        .setImage(file.url)
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    }

    // ================= VIEW PROFILE =================
    if (sub === "view") {
      const canvas = createCanvas(900, 350);
      const ctx = canvas.getContext("2d");
      
      const levelData = await getLevel();
      const userColor = profile.color || "#5865F2";
      
      // Get user's title
      let title = "🌟 Member";
      if (userId === DEV_ID) title = "👑 Developer";
      else if (await isVIP()) title = "💎 VIP Member";
      else if (levelData.level >= 100) title = "🏆 Legend";
      else if (levelData.level >= 50) title = "⚡ Elite";
      else if (levelData.level >= 25) title = "🌟 Dedicated";
      
      // ---- BACKGROUND ----
      let bg;
      try {
        if (profile.custom_bg) {
          bg = await loadImage(profile.custom_bg);
        } else if (profile.bg) {
          const shop = await redis.hgetall(`shop:bg:${profile.bg}`);
          if (shop?.url) bg = await loadImage(shop.url);
        }
      } catch {}
      
      if (bg) {
        ctx.drawImage(bg, 0, 0, 900, 350);
      } else {
        // Gradient background
        const gradient = ctx.createLinearGradient(0, 0, 900, 350);
        gradient.addColorStop(0, userColor + "33");
        gradient.addColorStop(1, "#2C3E50");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 900, 350);
      }
      
      // Overlay with glass morphism effect
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, 900, 350);
      
      // Glass effect overlay
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, 0, 900, 350);
      
      // ---- AVATAR ----
      const avatar = await loadImage(
        user.displayAvatarURL({ extension: "png", size: 256 })
      );
      
      // Avatar shadow
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 5;
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(130, 145, 80, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 45, 65, 170, 170);
      ctx.restore();
      
      // Avatar ring with glow
      ctx.shadowColor = userColor;
      ctx.shadowBlur = 30;
      ctx.strokeStyle = userColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(130, 145, 85, 0, Math.PI * 2);
      ctx.stroke();
      
      // Secondary ring
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(130, 145, 90, 0, Math.PI * 2);
      ctx.stroke();
      
      // ---- USERNAME ----
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 32px CustomFont";
      ctx.fillText(user.username, 270, 100);
      
      // ---- TITLE ----
      ctx.shadowBlur = 0;
      ctx.fillStyle = userColor;
      ctx.font = "bold 18px CustomFont";
      ctx.fillText(title, 270, 140);
      
      // ---- BIO ----
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "16px CustomFont";
      
      let bio = profile.bio || "No bio set";
      if (bio.length > 60) bio = bio.substring(0, 57) + "...";
      ctx.fillText(bio, 270, 175);
      
      // ---- STATS ----
      const stats = [
        { label: "💰", value: await getBal() },
        { label: "📊", value: `${levelData.xp}/${levelData.needed}` },
        { label: "⭐", value: levelData.level }
      ];
      
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "16px CustomFont";
      
      let xPos = 270;
      stats.forEach((stat, index) => {
        if (index > 0) ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillText("|", xPos + 20, 205);
        xPos += 40;
        
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "bold 16px CustomFont";
        ctx.fillText(stat.label, xPos, 205);
        xPos += 40;
        
        ctx.font = "16px CustomFont";
        ctx.fillStyle = userColor;
        ctx.fillText(stat.value, xPos, 205);
        xPos += 80;
      });
      
      // ---- XP BAR ----
      const barX = 270;
      const barY = 240;
      const barWidth = 540;
      const barHeight = 22;
      
      // Bar background
      ctx.shadowBlur = 5;
      ctx.shadowColor = "rgba(0,0,0,0.2)";
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth, barHeight, 11);
      ctx.fill();
      
      // XP progress with gradient
      const progress = levelData.progress;
      const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
      gradient.addColorStop(0, userColor);
      gradient.addColorStop(1, "#FF6B6B");
      ctx.fillStyle = gradient;
      ctx.shadowBlur = 10;
      ctx.shadowColor = userColor;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth * progress, barHeight, 11);
      ctx.fill();
      
      // Glowing effect on bar
      ctx.shadowBlur = 20;
      ctx.shadowColor = userColor + "55";
      ctx.fillRect(barX, barY, barWidth * progress, barHeight);
      
      // XP text
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 14px CustomFont";
      ctx.textAlign = "center";
      ctx.fillText(`⚡ ${levelData.xp} / ${levelData.needed} XP`, barX + barWidth / 2, barY + 17);
      
      // ---- BADGES ----
      ctx.textAlign = "left";
      ctx.font = "16px CustomFont";
      
      let badges = [];
      if (levelData.level >= 10) badges.push("⭐ Level 10+");
      if (levelData.level >= 25) badges.push("🌟 Level 25+");
      if (levelData.level >= 50) badges.push("⚡ Level 50+");
      if (levelData.level >= 100) badges.push("🏆 Level 100+");
      if (await isVIP()) badges.push("💎 VIP");
      if (userId === DEV_ID) badges.push("👑 Dev");
      
      if (badges.length > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "14px CustomFont";
        ctx.fillText(`🎖️ ${badges.join(" • ")}`, 270, 295);
      }
      
      // ---- LEVEL BADGE ----
      ctx.shadowBlur = 15;
      ctx.shadowColor = userColor;
      ctx.fillStyle = userColor;
      ctx.font = "bold 26px CustomFont";
      ctx.textAlign = "center";
      
      // Circle background for level
      const levelX = 780;
      const levelY = 80;
      
      ctx.shadowBlur = 20;
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.arc(levelX, levelY, 50, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = userColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(levelX, levelY, 50, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 18px CustomFont";
      ctx.fillText("LEVEL", levelX, levelY - 12);
      
      ctx.fillStyle = userColor;
      ctx.font = "bold 28px CustomFont";
      ctx.fillText(levelData.level, levelX, levelY + 22);
      
      // ---- FOOTER ----
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.font = "12px CustomFont";
      ctx.fillText(`ID: ${user.id.slice(0, 8)}... • ${new Date().toLocaleDateString()}`, 20, 340);
      
      ctx.textAlign = "right";
      ctx.fillText("✨ Profile v2.0", 880, 340);
      
      const buffer = canvas.toBuffer("image/png");
      
      const embed = new EmbedBuilder()
        .setColor(userColor)
        .setTitle(`👤 ${user.username}'s Profile`)
        .setDescription(`Level ${levelData.level} • ${title}`)
        .addFields(
          { name: "💰 Balance", value: `${await getBal()} coins`, inline: true },
          { name: "📊 Progress", value: `${Math.round(levelData.progress * 100)}% to next level`, inline: true }
        )
        .setImage("attachment://profile.png")
        .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();
      
      return interaction.editReply({
        embeds: [embed],
        files: [new AttachmentBuilder(buffer, { name: "profile.png" })]
      });
    }
  }
};

// Add roundRect polyfill for older Node versions
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (r > w/2) r = w/2;
    if (r > h/2) r = h/2;
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

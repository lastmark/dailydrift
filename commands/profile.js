const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { createCanvas, loadImage, registerFont, CanvasRenderingContext2D } = require("canvas");
const path = require("path");
const fs = require("fs");

// -------------------- FONT SETUP --------------------
const fontPath = path.join(__dirname, "../font.ttf");
try {
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family: "CustomFont" });
  }
} catch {}

// -------------------- HELPERS --------------------
const roundRect = (ctx, x, y, w, h, r) => {
  if (r > w / 2) r = w / 2;
  if (r > h / 2) r = h / 2;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  return ctx;
};

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    return roundRect(this, x, y, w, h, r);
  };
}

// -------------------- COMMAND --------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("✨ Ultimate profile & social system")

    // -------- PROFILE SUBCOMMANDS --------
    .addSubcommand(s =>
      s.setName("view")
        .setDescription("View a user's profile")
        .addUserOption(o =>
          o.setName("target").setDescription("User to view")
        )
    )
    .addSubcommand(s =>
      s.setName("setbio")
        .setDescription("Set your bio")
        .addStringOption(o =>
          o.setName("text")
            .setDescription("Your bio (max 200 chars)")
            .setRequired(true)
            .setMaxLength(200)
        )
    )
    .addSubcommand(s =>
      s.setName("setcolor")
        .setDescription("Set your profile accent color")
        .addStringOption(o =>
          o.setName("color")
            .setDescription("Hex color code (e.g., #FF6B6B)")
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("upload")
        .setDescription("Upload a custom background (VIP only)")
        .addAttachmentOption(o =>
          o.setName("image").setDescription("Image file").setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("reset")
        .setDescription("Reset your profile (with confirmation)")
    )

    // -------- SHOP SUBCOMMANDS --------
    .addSubcommand(s =>
      s.setName("shop")
        .setDescription("Browse backgrounds by category")
        .addStringOption(o =>
          o.setName("category")
            .setDescription("Filter")
            .addChoices(
              { name: "All", value: "all" },
              { name: "Premium", value: "premium" },
              { name: "Space", value: "space" },
              { name: "Fantasy", value: "fantasy" },
              { name: "Nature", value: "nature" }
            )
        )
    )
    .addSubcommand(s =>
      s.setName("buybg")
        .setDescription("Purchase a background")
        .addStringOption(o =>
          o.setName("id").setDescription("Background ID").setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("equipbg")
        .setDescription("Equip a background you own")
        .addStringOption(o =>
          o.setName("id").setDescription("Background ID").setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("backgrounds")
        .setDescription("View all backgrounds you own")
    )

    // -------- ADMIN SUBCOMMANDS --------
    .addSubcommand(s =>
      s.setName("addbg")
        .setDescription("(Admin) Add background to shop")
        .addStringOption(o =>
          o.setName("id").setDescription("Unique ID").setRequired(true)
        )
        .addStringOption(o =>
          o.setName("name").setDescription("Display name").setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("price").setDescription("Price in coins").setRequired(true).setMinValue(1)
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
          o.setName("image").setDescription("Background image").setRequired(true)
        )
    ),

  // -------------------- EXECUTION --------------------
  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("target") || interaction.user;
    const userId = user.id;
    const authorId = interaction.user.id;

    const DEV_ID = "1303357369622990889";        // Replace with your ID
    const VIP_ROLE_ID = "YOUR_VIP_ROLE_ID";      // Replace with your VIP role ID

    // -------------------- HELPERS --------------------
    const getProfile = async (id) => {
      const data = await redis.hgetall(`profile:${id}`);
      return data || {};
    };

    const getBalance = async (id) =>
      Number(await redis.get(`eco:${id}:money`) || 0);

    const isVIP = async (id) => {
      if (id === DEV_ID) return true;
      try {
        const member = await interaction.guild.members.fetch(id);
        return member.roles.cache.has(VIP_ROLE_ID);
      } catch {
        return false;
      }
    };

    const getLevelData = async (id) => {
      const profile = await getProfile(id);
      const level = Number(profile.level || 1);
      const xp = Number(profile.xp || 0);
      const needed = 100 * level;
      return { level, xp, needed, progress: Math.min(xp / needed, 1) };
    };

    const getTitle = async (id, level) => {
      if (id === DEV_ID) return "Developer";
      if (await isVIP(id)) return "VIP Member";
      if (level >= 100) return "Legend";
      if (level >= 50) return "Elite";
      if (level >= 25) return "Dedicated";
      return "Member";
    };

    // -------------------- SUBCOMMAND HANDLERS --------------------

    // --- SETBIO ---
    if (sub === "setbio") {
      const text = interaction.options.getString("text");
      await redis.hset(`profile:${authorId}`, "bio", text);
      const embed = new EmbedBuilder()
        .setColor("#00D4FF")
        .setTitle("Bio Updated")
        .setDescription(`> ${text}`)
        .setFooter({ text: "Your profile has been updated!" })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // --- SETCOLOR ---
    if (sub === "setcolor") {
      let color = interaction.options.getString("color");
      if (!color.startsWith("#")) color = `#${color}`;
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        return interaction.editReply("Invalid hex color. Use format `#FF6B6B`.");
      }
      await redis.hset(`profile:${authorId}`, "color", color);
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("Color Updated")
        .setDescription(`Your accent color is now ${color}`)
        .setFooter({ text: "Your profile will reflect this color!" })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // --- UPLOAD (VIP only) ---
    if (sub === "upload") {
      if (!(await isVIP(authorId))) {
        return interaction.editReply("This feature is for VIP members only.");
      }
      const file = interaction.options.getAttachment("image");
      if (!file.contentType?.startsWith("image/")) {
        return interaction.editReply("Please upload a valid image.");
      }
      await redis.hset(`profile:${authorId}`, "custom_bg", file.url);
      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("Premium Background Uploaded")
        .setImage(file.url)
        .setFooter({ text: "You can equip it with /profile equipbg" })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // --- RESET (with confirmation) ---
    if (sub === "reset") {
      const msg = await interaction.editReply({
        content: "Are you sure? This will delete your entire profile.\nReact with ✅ within 30 seconds to confirm.",
        flags: MessageFlags.Ephemeral
      });
      await msg.react("✅");
      try {
        const filter = (r, u) => r.emoji.name === "✅" && u.id === authorId;
        const collected = await msg.awaitReactions({ filter, max: 1, time: 30000 });
        if (collected.size) {
          await redis.del(`profile:${authorId}`);
          await interaction.editReply({
            content: "Profile reset successfully.",
            embeds: [],
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.editReply({
            content: "Reset cancelled.",
            flags: MessageFlags.Ephemeral
          });
        }
      } catch {
        await interaction.editReply({
          content: "Reset timed out.",
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    // --- SHOP ---
    if (sub === "shop") {
      const category = interaction.options.getString("category") || "all";
      const keys = await redis.keys("shop:bg:*");
      if (!keys.length) return interaction.editReply("Shop is empty.");

      const items = [];
      for (const key of keys) {
        const id = key.split(":")[2];
        const item = await redis.hgetall(key);
        if (category === "all" || item.category === category) {
          items.push({ id, ...item });
        }
      }
      if (!items.length) {
        return interaction.editReply(`No backgrounds in category: ${category}`);
      }

      const embed = new EmbedBuilder()
        .setColor("#FF6B6B")
        .setTitle(`Background Shop ${category !== "all" ? `- ${category}` : ""}`)
        .setDescription(`Balance: **${await getBalance(authorId)}** coins\nUse \`/profile buybg <id>\``)
        .setFooter({ text: `Showing ${items.length} backgrounds` })
        .setTimestamp();

      items.slice(0, 10).forEach((item, i) => {
        embed.addFields({
          name: `${i+1}. ${item.name || item.id}`,
          value: `ID: \`${item.id}\`\nPrice: ${item.price} coins\nCategory: ${item.category || "General"}`,
          inline: true
        });
      });
      return interaction.editReply({ embeds: [embed] });
    }

    // --- BUYBG ---
    if (sub === "buybg") {
      const id = interaction.options.getString("id");
      const item = await redis.hgetall(`shop:bg:${id}`);
      if (!item?.price) {
        return interaction.editReply("Invalid background ID. Use `/profile shop`.");
      }
      const bal = await getBalance(authorId);
      const price = Number(item.price);
      if (bal < price) {
        const embed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("Insufficient Funds")
          .setDescription(`You need **${price - bal}** more coins.`)
          .addFields(
            { name: "Balance", value: `${bal} coins`, inline: true },
            { name: "Price", value: `${price} coins`, inline: true }
          )
          .setFooter({ text: "Earn coins by being active!" })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }
      await redis.decrby(`eco:${authorId}:money`, price);
      await redis.sadd(`bg:owned:${authorId}`, id);
      await redis.hset(`profile:${authorId}`, "bg", id);
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("Background Purchased!")
        .setDescription(`You bought **${item.name || id}** and equipped it.`)
        .addFields(
          { name: "Price", value: `${price} coins`, inline: true },
          { name: "Remaining", value: `${await getBalance(authorId)} coins`, inline: true }
        )
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // --- EQUIPBG ---
    if (sub === "equipbg") {
      const id = interaction.options.getString("id");
      const owned = await redis.sismember(`bg:owned:${authorId}`, id);
      if (!owned) {
        return interaction.editReply("You don't own this background. Buy it first.");
      }
      await redis.hset(`profile:${authorId}`, "bg", id);
      const embed = new EmbedBuilder()
        .setColor("#00D4FF")
        .setTitle("Background Equipped")
        .setDescription(`Equipped **${id}**.`)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // --- BACKGROUNDS (owned list) ---
    if (sub === "backgrounds") {
      const owned = await redis.smembers(`bg:owned:${authorId}`);
      if (!owned.length) {
        return interaction.editReply("You don't own any backgrounds. Visit the shop!");
      }
      const embed = new EmbedBuilder()
        .setColor("#9B59B6")
        .setTitle(`${interaction.user.username}'s Backgrounds`)
        .setDescription(`You own **${owned.length}** background(s).`)
        .setFooter({ text: "Use /profile equipbg <id> to equip one." })
        .setTimestamp();

      const currentBg = (await getProfile(authorId)).bg;
      for (const id of owned.slice(0, 25)) {
        const shop = await redis.hgetall(`shop:bg:${id}`);
        const name = shop?.name || id;
        const equipped = id === currentBg ? "✓" : " ";
        embed.addFields({
          name: `${equipped} ${name}`,
          value: `ID: \`${id}\``,
          inline: true
        });
      }
      return interaction.editReply({ embeds: [embed] });
    }

    // --- ADMIN: ADDBG ---
    if (sub === "addbg") {
      if (authorId !== DEV_ID) {
        return interaction.editReply("This command is restricted to the developer.");
      }
      const id = interaction.options.getString("id");
      const name = interaction.options.getString("name");
      const price = interaction.options.getInteger("price");
      const category = interaction.options.getString("category");
      const file = interaction.options.getAttachment("image");
      if (!file.contentType?.startsWith("image/")) {
        return interaction.editReply("Invalid image file.");
      }
      await redis.hset(`shop:bg:${id}`, {
        name, price: price.toString(), url: file.url, category
      });
      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("Background Added")
        .setDescription(`**${name}** added to shop.`)
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

      const profile = await getProfile(userId);
      const levelData = await getLevelData(userId);
      const userColor = profile.color || "#5865F2";
      const title = await getTitle(userId, levelData.level);
      const balance = await getBalance(userId);

      // ---- BACKGROUND ----
      let bgImage;
      try {
        if (profile.custom_bg) {
          bgImage = await loadImage(profile.custom_bg);
        } else if (profile.bg) {
          const shop = await redis.hgetall(`shop:bg:${profile.bg}`);
          if (shop?.url) bgImage = await loadImage(shop.url);
        }
      } catch {}

      if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, 900, 350);
      } else {
        const gradient = ctx.createLinearGradient(0, 0, 900, 350);
        gradient.addColorStop(0, userColor + "33");
        gradient.addColorStop(1, "#2C3E50");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 900, 350);
      }

      // ---- GLASS OVERLAY ----
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, 900, 350);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, 0, 900, 350);

      // ---- AVATAR ----
      const avatar = await loadImage(
        user.displayAvatarURL({ extension: "png", size: 256 })
      );

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

      ctx.shadowColor = userColor;
      ctx.shadowBlur = 30;
      ctx.strokeStyle = userColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(130, 145, 85, 0, Math.PI * 2);
      ctx.stroke();

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
        { label: "Coins:", value: balance },
        { label: "XP:", value: `${levelData.xp}/${levelData.needed}` },
        { label: "Level:", value: levelData.level }
      ];

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "16px CustomFont";
      let xPos = 270;
      stats.forEach((stat, index) => {
        if (index > 0) {
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.fillText("|", xPos + 20, 205);
          xPos += 40;
        }
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "bold 16px CustomFont";
        ctx.fillText(stat.label, xPos, 205);
        xPos += 70;
        ctx.font = "16px CustomFont";
        ctx.fillStyle = userColor;
        ctx.fillText(stat.value, xPos, 205);
        xPos += 100;
      });

      // ---- XP BAR ----
      const barX = 270;
      const barY = 240;
      const barWidth = 540;
      const barHeight = 22;

      ctx.shadowBlur = 5;
      ctx.shadowColor = "rgba(0,0,0,0.2)";
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth, barHeight, 11);
      ctx.fill();

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

      ctx.shadowBlur = 20;
      ctx.shadowColor = userColor + "55";
      ctx.fillRect(barX, barY, barWidth * progress, barHeight);

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 14px CustomFont";
      ctx.textAlign = "center";
      ctx.fillText(`${levelData.xp} / ${levelData.needed} XP`, barX + barWidth / 2, barY + 17);

      // ---- BADGES ----
      ctx.textAlign = "left";
      ctx.font = "16px CustomFont";
      const badges = [];
      if (levelData.level >= 10) badges.push("Level 10+");
      if (levelData.level >= 25) badges.push("Level 25+");
      if (levelData.level >= 50) badges.push("Level 50+");
      if (levelData.level >= 100) badges.push("Level 100+");
      if (await isVIP(userId)) badges.push("VIP");
      if (userId === DEV_ID) badges.push("Dev");

      if (badges.length) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "14px CustomFont";
        ctx.fillText(`Badges: ${badges.join(" • ")}`, 270, 295);
      }

      // ---- LEVEL BADGE ----
      ctx.shadowBlur = 15;
      ctx.shadowColor = userColor;
      ctx.fillStyle = userColor;
      ctx.font = "bold 26px CustomFont";
      ctx.textAlign = "center";

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
      ctx.fillText(`ID: ${user.id.slice(0, 8)}...`, 20, 340);

      ctx.textAlign = "right";
      ctx.fillText("Profile v2.0", 880, 340);

      const buffer = canvas.toBuffer("image/png");

      const embed = new EmbedBuilder()
        .setColor(userColor)
        .setTitle(`${user.username}'s Profile`)
        .setDescription(`Level ${levelData.level} • ${title}`)
        .addFields(
          { name: "Balance", value: `${balance} coins`, inline: true },
          { name: "Progress", value: `${Math.round(levelData.progress * 100)}% to next level`, inline: true }
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

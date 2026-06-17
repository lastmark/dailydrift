const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");
const fs = require("fs");

const fontPath = path.join(__dirname, "../font.ttf");

try {
  if (fs.existsSync(fontPath)) {
    GlobalFonts.registerFromPath(fontPath, "CustomFont");
  }
} catch {}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Profile system")

    .addSubcommand(s =>
      s.setName("view")
        .setDescription("View profile")
        .addUserOption(o =>
          o.setName("target").setDescription("User")
        )
    )

    .addSubcommand(s =>
      s.setName("setbio")
        .setDescription("Set bio")
        .addStringOption(o =>
          o.setName("text").setDescription("Bio").setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("upload")
        .setDescription("Premium background")
        .addAttachmentOption(o =>
          o.setName("image").setDescription("Image").setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("reset")
        .setDescription("Reset background")
    )

    .addSubcommand(s =>
      s.setName("bgshop")
        .setDescription("View background shop")
    )

    .addSubcommand(s =>
      s.setName("buybg")
        .setDescription("Buy background")
        .addStringOption(o =>
          o.setName("id").setDescription("ID").setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("equipbg")
        .setDescription("Equip background")
        .addStringOption(o =>
          o.setName("id").setDescription("ID").setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("mybgs")
        .setDescription("Owned backgrounds")
    )

    .addSubcommand(s =>
      s.setName("addbg")
        .setDescription("Admin add bg")
        .addStringOption(o =>
          o.setName("id").setDescription("ID").setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("price").setDescription("Price").setRequired(true)
        )
        .addAttachmentOption(o =>
          o.setName("image").setDescription("Image").setRequired(true)
        )
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("target") || interaction.user;

    const userId = interaction.user.id;
    const targetId = user.id;

    const DEV_ID = "1303357369622990889";

    const profile = (await redis.hgetall(`profile:${targetId}`)) || {};

    // ================= BIO =================
    if (sub === "setbio") {
      const text = interaction.options.getString("text");
      await redis.hset(`profile:${userId}`, "bio", text);
      return interaction.editReply("Bio updated");
    }

    // ================= PREMIUM UPLOAD =================
    if (sub === "upload") {
      const file = interaction.options.getAttachment("image");

      await redis.hset(`profile:${userId}`, "custom_bg", file.url);
      return interaction.editReply("Premium BG saved");
    }

    // ================= RESET =================
    if (sub === "reset") {
      await redis.hdel(`profile:${userId}`, "custom_bg");
      await redis.hdel(`profile:${userId}`, "bg");
      return interaction.editReply("Reset done");
    }

    // ================= SHOP =================
    if (sub === "bgshop") {
      const keys = await redis.keys("shop:bg:*");

      if (!keys.length)
        return interaction.editReply("❌ No backgrounds available");

      let msg = "🛒 **Background Shop**\n\n";

      for (const key of keys) {
        const id = key.split(":")[2];
        const item = await redis.hgetall(key);

        msg += `**${id}** - ${item.price} coins\n`;
      }

      return interaction.editReply(msg);
    }

    // ================= BUY =================
    if (sub === "buybg") {
      const id = interaction.options.getString("id");

      const item = await redis.hgetall(`shop:bg:${id}`);
      if (!item?.price)
        return interaction.editReply("❌ Invalid ID");

      const bal = Number(await redis.get(`eco:${userId}:money`) || 0);

      if (bal < Number(item.price))
        return interaction.editReply("❌ Not enough coins");

      await redis.decrby(`eco:${userId}:money`, Number(item.price));

      await redis.sadd(`bg:owned:${userId}`, id);

      await redis.hset(`profile:${userId}`, "bg", id);

      return interaction.editReply("✅ Purchased & equipped");
    }

    // ================= EQUIP =================
    if (sub === "equipbg") {
      const id = interaction.options.getString("id");

      const owned = await redis.sismember(`bg:owned:${userId}`, id);

      if (!owned)
        return interaction.editReply("❌ You don't own this");

      await redis.hset(`profile:${userId}`, "bg", id);

      return interaction.editReply("✅ Equipped");
    }

    // ================= OWNED =================
    if (sub === "mybgs") {
      const list = await redis.smembers(`bg:owned:${userId}`);

      if (!list.length)
        return interaction.editReply("❌ No backgrounds owned");

      return interaction.editReply(`🎨 Owned:\n${list.join(", ")}`);
    }

    // ================= ADMIN ADD =================
    if (sub === "addbg") {
      if (userId !== DEV_ID)
        return interaction.editReply("❌ No permission");

      const id = interaction.options.getString("id");
      const price = interaction.options.getInteger("price");
      const file = interaction.options.getAttachment("image");

      if (!file.contentType?.startsWith("image/"))
        return interaction.editReply("❌ Invalid image");

      await redis.hset(`shop:bg:${id}`, {
        price: price.toString(),
        url: file.url
      });

      return interaction.editReply(`🛒 Added ${id}`);
    }

    // ================= VIEW =================
    if (sub === "view") {
      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      let bg = null;

      try {
        if (profile.custom_bg) {
          bg = await loadImage(profile.custom_bg);

        } else if (profile.bg) {
          const item = await redis.hgetall(`shop:bg:${profile.bg}`);
          if (item?.url) bg = await loadImage(item.url);

        } else {
          bg = await loadImage(path.join(__dirname, "../backgrounds/classic.png"));
        }
      } catch {}

      if (bg) ctx.drawImage(bg, 0, 0, 800, 300);
      else {
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, 800, 300);
      }

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, 800, 300);

      const avatar = await loadImage(
        user.displayAvatarURL({ extension: "png", size: 256 })
      );

      ctx.save();
      ctx.beginPath();
      ctx.arc(110, 130, 70, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 35, 55, 150, 150);
      ctx.restore();

      ctx.strokeStyle = "#5865F2";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(110, 130, 72, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "28px CustomFont";
      ctx.fillText(user.username, 220, 85);

      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "18px CustomFont";
      ctx.fillText(profile.bio || "No bio set", 220, 130);

      const buffer = canvas.toBuffer("image/png");

      return interaction.editReply({
        files: [new AttachmentBuilder(buffer, { name: "profile.png" })]
      });
    }
  }
};

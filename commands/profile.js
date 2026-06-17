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
          o.setName("target").setDescription("User").setRequired(false)
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
        .setDescription("Reset profile background")
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser("target") || interaction.user;

    const profile = (await redis.hgetall(`profile:${target.id}`)) || {};

    // ================= BIO =================
    if (sub === "setbio") {
      const text = interaction.options.getString("text");
      await redis.hset(`profile:${interaction.user.id}`, "bio", text);
      return interaction.editReply("Bio updated");
    }

    // ================= PREMIUM BG =================
    if (sub === "upload") {
      const file = interaction.options.getAttachment("image");

      await redis.hset(`profile:${interaction.user.id}`, "custom_bg", file.url);
      return interaction.editReply("Premium BG saved");
    }

    // ================= RESET =================
    if (sub === "reset") {
      await redis.hdel(`profile:${interaction.user.id}`, "custom_bg");
      await redis.hdel(`profile:${interaction.user.id}`, "bg");
      return interaction.editReply("Reset done");
    }

    // ================= VIEW =================
    if (sub === "view") {
      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      let bg = null;

      try {
        // 1. Premium BG
        if (profile.custom_bg) {
          bg = await loadImage(profile.custom_bg);

        // 2. Shop BG
        } else if (profile.bg) {
          const item = await redis.hgetall(`shop:bg:${profile.bg}`);
          if (item?.url) bg = await loadImage(item.url);

        // 3. Default
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
        target.displayAvatarURL({ extension: "png", size: 256 })
      );

      const ax = 110, ay = 130;

      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, ay, 70, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 35, 55, 150, 150);
      ctx.restore();

      ctx.strokeStyle = "#5865F2";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ax, ay, 72, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "28px CustomFont";
      ctx.fillText(target.username, 220, 85);

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

const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

try {
  GlobalFonts.registerFromPath(
    path.join(__dirname, "../font.ttf"),
    "CustomFont"
  );
} catch {}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile system")

    .addSubcommand(s =>
      s.setName("view")
        .setDescription("View a user profile")
        .addUserOption(o =>
          o.setName("target")
            .setDescription("User to view")
            .setRequired(false)
        )
    )

    .addSubcommand(s =>
      s.setName("setbio")
        .setDescription("Set your bio")
        .addStringOption(o =>
          o.setName("text")
            .setDescription("Your bio text (max 80 chars)")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("upload")
        .setDescription("Upload profile background")
        .addAttachmentOption(o =>
          o.setName("image")
            .setDescription("Background image")
            .setRequired(true)
        )
    )

    .addSubcommand(s =>
      s.setName("reset")
        .setDescription("Reset profile background")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "setbio") {
      const text = interaction.options.getString("text");
      if (text.length > 80)
        return interaction.reply({ content: "Max 80 chars", ephemeral: true });

      await redis.hset(`profile:${userId}`, "bio", text);
      return interaction.reply({ content: "Bio updated", ephemeral: true });
    }

    if (sub === "upload") {
      const file = interaction.options.getAttachment("image");

      if (!file.contentType?.startsWith("image/"))
        return interaction.reply({ content: "Invalid image", ephemeral: true });

      await redis.hset(`profile:${userId}`, "custom_bg", file.url);
      return interaction.reply({ content: "Background saved", ephemeral: true });
    }

    if (sub === "reset") {
      await redis.hdel(`profile:${userId}`, "custom_bg");
      return interaction.reply({ content: "Reset done", ephemeral: true });
    }

    if (sub === "view") {
      await interaction.deferReply();

      const target = interaction.options.getUser("target") || interaction.user;
      const data = (await redis.hgetall(`profile:${target.id}`)) || {};

      const bio = data.bio || "No bio set";
      const bg = data.custom_bg;

      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      try {
        const image = bg
          ? await loadImage(bg)
          : await loadImage(path.join(__dirname, "../backgrounds/classic.png"));

        ctx.drawImage(image, 0, 0, 800, 300);
      } catch {
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, 800, 300);
      }

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, 800, 300);

      const avatar = await loadImage(
        target.displayAvatarURL({ extension: "png", size: 256 })
      );

      ctx.beginPath();
      ctx.arc(110, 130, 70, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 35, 55, 150, 150);

      ctx.fillStyle = "#fff";
      ctx.font = "28px CustomFont";
      ctx.fillText(target.username, 220, 90);

      ctx.font = "18px CustomFont";
      ctx.fillText(bio, 220, 140);

      const buffer = canvas.toBuffer("image/png");

      return interaction.editReply({
        files: [new AttachmentBuilder(buffer, { name: "profile.png" })]
      });
    }
  }
};

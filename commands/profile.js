const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

try {
  const fontPath = path.join(__dirname, "../font.ttf");
  GlobalFonts.registerFromPath(fontPath, "CustomFont");
} catch (err) {
  console.log("⚠️ Font file registration offline:", err.message);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("👤 Design and display customized aesthetic user profile cards.")
    .addSubcommand(sub =>
      sub.setName("view")
        .setDescription("Render your graphical profile card layer.")
        .addUserOption(opt =>
          opt.setName("target")
            .setDescription("Select a user to inspect")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName("setbio")
        .setDescription("Modify your personal database biography.")
        .addStringOption(opt =>
          opt.setName("text")
            .setDescription("Your new bio text (Max 80 chars)")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("upload")
        .setDescription("🖼️ Upload a custom 800x300 background image attachment (Premium Only).")
        .addAttachmentOption(opt =>
          opt.setName("image")
            .setDescription("Your custom background profile image")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("reset")
        .setDescription("🔄 Clear your custom background image.")
    ),

  async execute(interaction, client, redis) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const DEVELOPER_ID = "1303357369622990889";

    if (subcommand === "setbio") {
      const bioText = interaction.options.getString("text");
      if (bioText.length > 80) {
        return interaction.reply({
          content: "❌ Bio text must be 80 characters or less.",
          ephemeral: true
        });
      }

      await redis.hset(`profile:${userId}`, "bio", bioText);
      return interaction.reply({ content: "✅ Biography updated.", ephemeral: true });
    }

    if (subcommand === "upload") {
      const isPremiumUser = await redis.get(`premium:user:${userId}`);

      if (interaction.user.id !== DEVELOPER_ID && !isPremiumUser) {
        return interaction.reply({
          content: "❌ Access Denied: Premium required.",
          ephemeral: true
        });
      }

      const attachment = interaction.options.getAttachment("image");

      if (!attachment.contentType?.startsWith("image/")) {
        return interaction.reply({
          content: "❌ File must be an image.",
          ephemeral: true
        });
      }

      await redis.hset(`profile:${userId}`, "custom_bg", attachment.url);
      return interaction.reply({
        content: "✅ Custom background saved.",
        ephemeral: true
      });
    }

    if (subcommand === "reset") {
      await redis.hdel(`profile:${userId}`, "custom_bg");
      return interaction.reply({
        content: "🔄 Background removed.",
        ephemeral: true
      });
    }

    if (subcommand === "view") {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser("target") || interaction.user;

      const profileData = await redis.hgetall(`profile:${targetUser.id}`) || {};
      const bio = profileData.bio || "No bio set";
      const customBgUrl = profileData.custom_bg;
      const equippedBg = profileData.equipped || "classic";

      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      try {
        let bg;
        if (customBgUrl) {
          bg = await loadImage(customBgUrl);
        } else {
          bg = await loadImage(path.join(__dirname, `../backgrounds/${equippedBg}.png`));
        }
        ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
      } catch {
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const avatar = await loadImage(
        targetUser.displayAvatarURL({ extension: "png", size: 256 })
      );

      ctx.save();
      ctx.beginPath();
      ctx.arc(110, 130, 75, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 35, 55, 150, 150);
      ctx.restore();

      ctx.fillStyle = "#fff";
      ctx.font = "28px CustomFont";
      ctx.fillText(targetUser.username, 220, 90);

      ctx.font = "18px CustomFont";
      ctx.fillText(bio, 220, 140);

      const buffer = canvas.toBuffer("image/png");
      const file = new AttachmentBuilder(buffer, {
        name: `profile-${targetUser.id}.png`
      });

      return interaction.editReply({ files: [file] });
    }
  }
};

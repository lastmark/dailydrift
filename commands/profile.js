const { createCanvas, loadImage, CanvasRenderingContext2D } = require('canvas');
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');

// RoundRect polyfill (runs AFTER canvas is imported)
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile or someone else's")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("The user to view profile of")
        .setRequired(false)),

  async execute(interaction, client, redis) {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id);

    // Get user data from Redis (example)
    const xp = await redis.get(`xp:${user.id}`) || 0;
    const level = await redis.get(`level:${user.id}`) || 1;
    const messages = await redis.get(`messages:${user.id}`) || 0;

    // Create canvas
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#23272a');
    gradient.addColorStop(1, '#2c2f33');
    ctx.fillStyle = gradient;
    ctx.roundRect(0, 0, canvas.width, canvas.height, 20);
    ctx.fill();

    // Avatar
    const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
    const avatar = await loadImage(avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(120, 120, 80, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 40, 40, 160, 160);
    ctx.restore();

    // Avatar border
    ctx.beginPath();
    ctx.arc(120, 120, 85, 0, Math.PI * 2);
    ctx.strokeStyle = '#5865f2';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Username
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.fillText(user.username, 220, 100);

    // Tag
    ctx.fillStyle = '#b9bbbe';
    ctx.font = '24px Arial';
    ctx.fillText(`#${user.discriminator}`, 220, 140);

    // Stats
    ctx.fillStyle = '#b9bbbe';
    ctx.font = '18px Arial';
    ctx.fillText(`Level: ${level}`, 220, 190);
    ctx.fillText(`XP: ${xp}`, 220, 220);
    ctx.fillText(`Messages: ${messages}`, 220, 250);

    // Badge
    if (user.id === "1303357369622990889") {
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 20px Arial';
      ctx.fillText('👑 Owner', 220, 300);
    }

    // Footer
    ctx.fillStyle = '#5865f2';
    ctx.font = '14px Arial';
    ctx.fillText('Discord Profile Card', 30, 370);

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'profile.png' });

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Profile`)
      .setImage('attachment://profile.png')
      .setColor('#5865f2')
      .setTimestamp()
      .setFooter({ text: `Requested by ${interaction.user.username}` });

    await interaction.reply({ embeds: [embed], files: [attachment] });
  }
};

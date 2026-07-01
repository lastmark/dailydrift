// logging.js – Centralized Audit Logging System (MongoDB Optimized)
const { EmbedBuilder } = require("discord.js");

module.exports = (client, db) => {
  
  const sendLog = async (guild, embed) => {
    if (!guild) return;
    const channelId = await db.get(`auditlog:${guild.id}`);
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    channel.send({ embeds: [embed] }).catch(() => {});
  };

  // ================= MESSAGE DELETE =================
  client.on("messageDelete", async (message) => {
    if (!message.guild || message.author?.bot || !message.content) return;

    const embed = new EmbedBuilder()
      .setColor("#ED4245")
      .setTitle("🗑 Message Deleted")
      .addFields(
        { name: "👤 User", value: `${message.author.tag}`, inline: true },
        { name: "📌 Channel", value: `<#${message.channel.id}>`, inline: true },
        { name: "📝 Content", value: `\`\`\`${message.content.slice(0, 1000)}\`\`\`` }
      )
      .setTimestamp();

    sendLog(message.guild, embed);
  });

  // ================= MESSAGE EDIT =================
  client.on("messageUpdate", async (oldMsg, newMsg) => {
    if (!oldMsg.guild || oldMsg.author?.bot) return;
    
    // Ensure we handle partials; if content is identical, ignore.
    if (oldMsg.content === newMsg.content || !oldMsg.content) return;

    const embed = new EmbedBuilder()
      .setColor("#FEE75C")
      .setTitle("✏ Message Edited")
      .addFields(
        { name: "👤 User", value: `${oldMsg.author.tag}`, inline: true },
        { name: "📌 Channel", value: `<#${oldMsg.channel.id}>`, inline: true },
        { name: "⬅️ Before", value: `\`\`\`${oldMsg.content.slice(0, 1000)}\`\`\`` },
        { name: "➡️ After", value: `\`\`\`${newMsg.content.slice(0, 1000)}\`\`\`` }
      )
      .setTimestamp();

    sendLog(oldMsg.guild, embed);
  });

  // ================= MEMBER EVENTS =================
  client.on("guildMemberAdd", async (member) => {
    const embed = new EmbedBuilder()
      .setColor("#57F287")
      .setTitle("📥 Member Joined")
      .setDescription(`**User:** ${member.user.tag}\n**ID:** \`${member.id}\``)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();
    sendLog(member.guild, embed);
  });

  client.on("guildMemberRemove", async (member) => {
    const embed = new EmbedBuilder()
      .setColor("#ED4245")
      .setTitle("📤 Member Left")
      .setDescription(`**User:** ${member.user.tag}\n**ID:** \`${member.id}\``)
      .setTimestamp();
    sendLog(member.guild, embed);
  });

  // ================= CHANNEL/ROLE EVENTS =================
  client.on("channelCreate", (ch) => sendLog(ch.guild, new EmbedBuilder().setColor("#5865F2").setTitle("📢 Channel Created").setDescription(ch.name)));
  client.on("channelDelete", (ch) => sendLog(ch.guild, new EmbedBuilder().setColor("#ED4245").setTitle("🗑 Channel Deleted").setDescription(ch.name)));
  client.on("roleCreate", (role) => sendLog(role.guild, new EmbedBuilder().setColor("#57F287").setTitle("🎭 Role Created").setDescription(role.name)));
  client.on("roleDelete", (role) => sendLog(role.guild, new EmbedBuilder().setColor("#ED4245").setTitle("🎭 Role Deleted").setDescription(role.name)));
};

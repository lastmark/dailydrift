module.exports = (client, redis) => {

  const sendLog = async (guild, embed) => {
    const channelId = await redis.get(`auditlog:${guild.id}`);
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    channel.send({ embeds: [embed] }).catch(() => {});
  };

  // ================= MESSAGE DELETE =================
  client.on("messageDelete", async (message) => {
    if (!message.guild || message.author?.bot) return;

    const embed = {
      color: 0xff5555,
      title: "🗑 Message Deleted",
      fields: [
        { name: "User", value: `${message.author}`, inline: true },
        { name: "Channel", value: `${message.channel}`, inline: true },
        { name: "Content", value: message.content || "No content" }
      ],
      timestamp: new Date()
    };

    sendLog(message.guild, embed);
  });

  // ================= MESSAGE EDIT =================
  client.on("messageUpdate", async (oldMsg, newMsg) => {
    if (!oldMsg.guild || oldMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return;

    const embed = {
      color: 0xffcc00,
      title: "✏ Message Edited",
      fields: [
        { name: "User", value: `${oldMsg.author}`, inline: true },
        { name: "Channel", value: `${oldMsg.channel}`, inline: true },
        { name: "Before", value: oldMsg.content || "None" },
        { name: "After", value: newMsg.content || "None" }
      ],
      timestamp: new Date()
    };

    sendLog(oldMsg.guild, embed);
  });

  // ================= MEMBER JOIN =================
  client.on("guildMemberAdd", async (member) => {
    const embed = {
      color: 0x57f287,
      title: "📥 Member Joined",
      fields: [
        { name: "User", value: `${member.user}` },
        { name: "ID", value: member.id }
      ],
      timestamp: new Date()
    };

    sendLog(member.guild, embed);
  });

  // ================= MEMBER LEAVE =================
  client.on("guildMemberRemove", async (member) => {
    const embed = {
      color: 0xff5555,
      title: "📤 Member Left",
      fields: [
        { name: "User", value: `${member.user?.tag || "Unknown"}` },
        { name: "ID", value: member.id }
      ],
      timestamp: new Date()
    };

    sendLog(member.guild, embed);
  });

  // ================= CHANNEL CREATE =================
  client.on("channelCreate", async (channel) => {
    if (!channel.guild) return;

    const embed = {
      color: 0x5865f2,
      title: "📢 Channel Created",
      description: `${channel.name}`,
      timestamp: new Date()
    };

    sendLog(channel.guild, embed);
  });

  // ================= CHANNEL DELETE =================
  client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;

    const embed = {
      color: 0xff5555,
      title: "🗑 Channel Deleted",
      description: `${channel.name}`,
      timestamp: new Date()
    };

    sendLog(channel.guild, embed);
  });

  // ================= ROLE CREATE =================
  client.on("roleCreate", async (role) => {
    const embed = {
      color: 0x57f287,
      title: "🎭 Role Created",
      description: `${role.name}`,
      timestamp: new Date()
    };

    sendLog(role.guild, embed);
  });

  // ================= ROLE DELETE =================
  client.on("roleDelete", async (role) => {
    const embed = {
      color: 0xff5555,
      title: "🎭 Role Deleted",
      description: `${role.name}`,
      timestamp: new Date()
    };

    sendLog(role.guild, embed);
  });

  // ================= BAN =================
  client.on("guildBanAdd", async (ban) => {
    const embed = {
      color: 0xff0000,
      title: "⛔ User Banned",
      description: `${ban.user.tag}`,
      timestamp: new Date()
    };

    sendLog(ban.guild, embed);
  });

  // ================= UNBAN =================
  client.on("guildBanRemove", async (ban) => {
    const embed = {
      color: 0x57f287,
      title: "✅ User Unbanned",
      description: `${ban.user.tag}`,
      timestamp: new Date()
    };

    sendLog(ban.guild, embed);
  });
};

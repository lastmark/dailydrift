const redis = require("../utils/redis");
const { generateLeaveImage } = require("../utils/canvas");
const config = require("../config");

module.exports = async (client, member) => {
  const guildId = member.guild.id;
  const channelId = await redis.get(`guild:${guildId}:leaveChannel`);
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  let msg = await redis.get(`guild:${guildId}:leaveMsg`) || config.DEFAULT_LEAVE_MSG;
  msg = msg.replace(/{user}/g, member.user.tag).replace(/{server}/g, member.guild.name);
  const bgUrl = await redis.get(`guild:${guildId}:leaveImage`);
  const image = await generateLeaveImage(member.user, member.guild, msg, bgUrl);
  
  await channel.send({ content: `${config.ICONS.memberLeave} ${msg}`, files: [image] }).catch(console.error);
};

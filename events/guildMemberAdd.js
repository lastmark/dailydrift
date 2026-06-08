const redis = require("../utils/redis");
const { generateWelcomeImage } = require("../utils/canvas");
const config = require("../config");

module.exports = async (client, member) => {
  const guildId = member.guild.id;
  const channelId = await redis.get(`guild:${guildId}:welcomeChannel`);
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  let msg = await redis.get(`guild:${guildId}:welcomeMsg`) || config.DEFAULT_WELCOME_MSG;
  msg = msg.replace(/{user}/g, member.user.tag).replace(/{server}/g, member.guild.name);
  const bgUrl = await redis.get(`guild:${guildId}:welcomeImage`);
  const image = await generateWelcomeImage(member.user, member.guild, msg, bgUrl);
  
  // Prepend memberAdd icon
  await channel.send({ content: `${config.ICONS.memberAdd} ${msg}`, files: [image] }).catch(console.error);
};

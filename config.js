module.exports = {
  COUNTING_KEY: (guildId, channelId) => `counting:${guildId}:${channelId}`,
  RPS_KEY: (challengeId) => `rps:${challengeId}`,
  PICTURE_RACE_KEY: (channelId) => `picrace:${channelId}`,
  PICTURE_WORDS: ["apple", "cat", "sun", "house", "fish", "bird", "car", "tree", "moon", "star"],
  DEFAULT_WELCOME_MSG: "Welcome {user} to {server}!",
  DEFAULT_LEAVE_MSG: "{user} left {server}.",

  // Your custom icons – use them as <:name:id> anywhere in text
  ICONS: {
    bot: "<:bot:1513533291385458708>",
    error: "<:error:1513532700202631240>",
    message: "<:message:1513533207037874196>",
    setting: "<:setting:1513533096740257993>",
    search: "<:search:1513533580087787530>",
    coin: "<:coin_flip:1513532556140744856>",
    memberAdd: "<:memberadd:1513532586998239335>",
    memberLeave: "<:memberleave:1513532632992845965>",
    user: "<:user:1513533036472307814>",
    announce: "<:announcement:1513533499607351356>",
    rock: "<:rock:1513532823301259446>",
    paper: "<:paper:1513532786445783151>",
    scissor: "<:scissor:1513532752669053090>"
  }
};

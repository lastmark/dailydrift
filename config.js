module.exports = {
  COUNTING_KEY: (guildId, channelId) => `counting:${guildId}:${channelId}`,
  RPS_KEY: (challengeId) => `rps:${challengeId}`,
  PICTURE_RACE_KEY: (channelId) => `picrace:${channelId}`,
  PICTURE_WORDS: ["apple", "cat", "sun", "house", "fish", "bird", "car", "tree", "moon", "star"],
  DEFAULT_WELCOME_MSG: "Welcome {user} to {server}!",
  DEFAULT_LEAVE_MSG: "{user} left {server}.",
};

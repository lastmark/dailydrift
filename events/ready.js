module.exports = (client) => {
  console.log(`✅ ${client.user.tag} is online`);
  client.user.setPresence({ activities: [{ name: "/help | am i real?", type: 3 }] });
};

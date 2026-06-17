const { Events, EmbedBuilder } = require("discord.js");

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client, redis) {
    if (!message.guild || message.author.bot) return;

    const userId = message.author.id;
    const guildId = message.guild.id;

    /* =========================
       🔒 COOLDOWN SYSTEM
    ========================= */
    const cooldownKey = `xp:cd:${guildId}:${userId}`;
    if (await redis.get(cooldownKey)) return;
    await redis.setex(cooldownKey, 60, "1");

    /* =========================
       💎 PREMIUM CHECK
    ========================= */
    const isPremium = await redis.get(`premium:user:${userId}`);

    /* =========================
       🎯 BASE REWARDS
    ========================= */
    let xpGain = Math.floor(Math.random() * 11) + 15; // 15–25 XP
    let coinGain = Math.floor(Math.random() * 10) + 10; // 10–20 coins

    if (isPremium) {
      xpGain = Math.floor(xpGain * 1.8);
      coinGain = Math.floor(coinGain * 1.8);
    }

    /* =========================
       🧠 XP SYSTEM (GLOBAL PROFILE)
    ========================= */
    const profileKey = `profile:${userId}`;

    let xp = Number(await redis.hget(profileKey, "xp") || 0);
    let level = Number(await redis.hget(profileKey, "level") || 1);

    xp += xpGain;

    const needed = Math.floor(100 * Math.pow(level, 1.6));

    if (xp >= needed && level < 120) {
      xp -= needed;
      level++;

      await redis.hset(profileKey, "level", level);

      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle("⚡ Level Up!")
            .setDescription(`You reached **Level ${level}**`)
        ]
      }).catch(() => {});
    }

    await redis.hset(profileKey, "xp", xp);

    /* =========================
       💰 ECONOMY SYSTEM
    ========================= */
    await redis.incrby(`eco:${guildId}:${userId}:money`, coinGain);

    /* =========================
       🤖 AUTO RESPONDER
    ========================= */
    const key = message.content.toLowerCase().trim();
    const responder = await redis.get(`responder:${guildId}:${key}`);

    if (responder) {
      const data = JSON.parse(responder);

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(data.color || "#5865F2")
            .setTitle(data.title)
            .setDescription(data.reply)
        ]
      });
    }

    /* =========================
       🔧 DEVV COMMAND (TEST TOOL)
    ========================= */
    const prefix = "!";
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "devv") {
      if (userId !== "1303357369622990889") return;

      const sub = args[0];

      if (sub === "xp") {
        await redis.hset(profileKey, "xp", 4000);
        await redis.hset(profileKey, "level", 50);
        return message.reply("XP reset for testing.");
      }

      if (sub === "coins") {
        await redis.set(`eco:${guildId}:${userId}:money`, 10000);
        return message.reply("Coins set to 10,000.");
      }

      return message.reply("Usage: !devv xp | coins");
    }
  }
};

// games/counting.js – Ultra‑fast counting (in‑memory cache, DB background sync)
const { EmbedBuilder } = require("discord.js");

// Guild cache: guildId -> { next, last, users: { userId: { streak, best } } }
const cache = new Map();

// Load a guild's state from DB into cache (called on first message in that guild)
async function loadGuild(guildId, db) {
  const data = await db.get(`counting:${guildId}`);
  if (data) {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    cache.set(guildId, parsed);
  } else {
    // init fresh
    cache.set(guildId, { next: 1, last: null, users: {} });
  }
}

// Save a guild's state back to DB (fire‑and‑forget)
function saveGuild(guildId, db, state) {
  db.set(`counting:${guildId}`, JSON.stringify(state)).catch(() => {});
}

module.exports = async function counting(message, db) {
  const userId = message.author.id;
  const guildId = message.guild.id;

  // Ensure the guild is loaded in cache (first message after restart)
  if (!cache.has(guildId)) {
    await loadGuild(guildId, db);
  }
  const state = cache.get(guildId);

  const rawContent = message.content.trim();

  // ---- Prevent double counts ----
  if (state.last === userId) {
    if (message.deletable) await message.delete().catch(() => {});
    const warnEmbed = new EmbedBuilder()
      .setColor("#FEE75C")
      .setDescription(`⚠️ ${message.author}, you can't count twice in a row!`);
    const warnMsg = await message.channel.send({ embeds: [warnEmbed] }).catch(() => {});
    if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 3000);
    return;
  }

  // ---- Parse number ----
  let userNumber;
  try {
    const sanitized = rawContent.replace(/\^/g, '**');
    if (!/^[0-9+\-*/() ]+$/.test(sanitized)) {
      userNumber = NaN;
    } else {
      userNumber = eval(sanitized);
    }
  } catch {
    userNumber = NaN;
  }

  // ---- Wrong count ----
  if (isNaN(userNumber) || userNumber !== state.next) {
    if (message.deletable) await message.delete().catch(() => {});

    // Shield check
    const shields = Number(await db.get(`eco:${userId}:shield`) || 0);
    if (shields > 0) {
      await db.set(`eco:${userId}:shield`, shields - 1);
      const shieldEmbed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("🛡️ Shield Protection")
        .setDescription(`${message.author.username} made a mistake, but a shield saved their streak!`)
        .addFields(
          { name: "Remaining Shields", value: `${shields - 1}`, inline: true },
          { name: "Expected Number", value: `${state.next}`, inline: true }
        )
        .setFooter({ text: "The count continues..." });
      const msg = await message.channel.send({ embeds: [shieldEmbed] });
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return; // Count NOT reset
    }

    // Premium streak freeze
    const isPremium = await db.get(`premium:user:${userId}`);
    if (isPremium) {
      const freezeKey = `counting:freeze:${userId}`;
      const lastFreeze = await db.get(freezeKey);
      if (!lastFreeze || (Date.now() - Number(lastFreeze) > 24 * 60 * 60 * 1000)) {
        await db.set(freezeKey, Date.now());
        const freezeEmbed = new EmbedBuilder()
          .setColor("#00AAFF")
          .setTitle("❄️ Premium Streak Freeze")
          .setDescription(`${message.author.username}'s premium freeze saved their streak!`)
          .addFields({ name: "Expected Number", value: `${state.next}`, inline: true })
          .setFooter({ text: "The count continues..." });
        const msg = await message.channel.send({ embeds: [freezeEmbed] });
        setTimeout(() => msg.delete().catch(() => {}), 5000);
        return; // Count NOT reset
      }
    }

    // No protection – reset the count
    const resetEmbed = new EmbedBuilder()
      .setColor("#ED4245")
      .setTitle("❌ Wrong Number!")
      .setDescription(
        `${message.author.username} broke the chain.\n` +
        `The correct number was **${state.next}**, but they sent **${userNumber}**.`
      )
      .addFields({ name: "Count", value: "Reset to **1**" })
      .setTimestamp();
    await message.channel.send({ embeds: [resetEmbed] });

    // Reset cache + DB
    state.next = 1;
    state.last = null;
    // Also reset the user's streak (keep best?)
    if (state.users[userId]) {
      state.users[userId].streak = 0;
      // increment mistakes
      state.users[userId].mistakes = (state.users[userId].mistakes || 0) + 1;
    } else {
      state.users[userId] = { streak: 0, best: 0, correct: 0, mistakes: 1 };
    }
    saveGuild(guildId, db, state);
    return;
  }

  // ---- CORRECT COUNT ----
  // ✅ React immediately (before any DB call)
  await message.react("✅").catch(() => {});

  // Update cache
  state.next++;
  state.last = userId;

  // Update user stats in cache
  if (!state.users[userId]) {
    state.users[userId] = { streak: 0, best: 0, correct: 0, mistakes: 0 };
  }
  const userStats = state.users[userId];
  userStats.correct = (userStats.correct || 0) + 1;
  userStats.streak = (userStats.streak || 0) + 1;
  if (userStats.streak > (userStats.best || 0)) {
    userStats.best = userStats.streak;
  }

  // Save to DB in background (fire‑and‑forget)
  saveGuild(guildId, db, state);

  // Streak milestone (optional, still fast)
  if (userStats.streak === 10 || userStats.streak === 25 || userStats.streak === 50 || userStats.streak === 100 || userStats.streak === 250) {
    const milestoneEmbed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("🔥 Streak Milestone!")
      .setDescription(`${message.author.username} reached a **${userStats.streak}** count streak!`)
      .setTimestamp();
    await message.channel.send({ embeds: [milestoneEmbed] });
  }
};

// games/counting.js – Improved logic, shield/freeze UI, duplicate prevention, correct number on reset
const { EmbedBuilder } = require("discord.js");

module.exports = async function counting(message, db) {
  const userId = message.author.id;
  const guildId = message.guild.id;

  // ---- Parse the expected number ----
  const nextKey = `counting:${guildId}:next`;
  const expected = Number(await db.get(nextKey)) || 1;
  const rawContent = message.content.trim();

  // ---- Prevent same user from counting twice in a row ----
  const lastCounter = await db.get(`counting:${guildId}:last`);
  if (lastCounter === userId) {
    // Delete the duplicate attempt
    if (message.deletable) await message.delete().catch(() => {});
    // Send a warning embed that auto‑deletes after 3 seconds
    const warnEmbed = new EmbedBuilder()
      .setColor("#FEE75C")
      .setDescription(`⚠️ ${message.author}, you can't count twice in a row!`);
    const warnMsg = await message.channel.send({ embeds: [warnEmbed] }).catch(() => {});
    if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 3000);
    return; // Stop processing – count is not reset
  }

  let userNumber;
  try {
    // Convert ^ to ** for exponent support
    const sanitized = rawContent.replace(/\^/g, '**');
    if (!/^[0-9+\-*/() ]+$/.test(sanitized)) {
      userNumber = NaN;
    } else {
      userNumber = eval(sanitized);
    }
  } catch {
    userNumber = NaN;
  }

  if (isNaN(userNumber) || userNumber !== expected) {
    // ---- WRONG COUNT ----
    if (message.deletable) await message.delete().catch(() => {});

    // Check for shield
    const shields = Number(await db.get(`eco:${userId}:shield`) || 0);
    if (shields > 0) {
      // Use shield – protect streak
      await db.set(`eco:${userId}:shield`, shields - 1);

      const shieldEmbed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("🛡️ Shield Protection")
        .setDescription(`**${message.author.username}** made a mistake, but a shield saved their streak!`)
        .addFields(
          { name: "Remaining Shields", value: `${shields - 1}`, inline: true },
          { name: "Expected Number", value: `${expected}`, inline: true }
        )
        .setFooter({ text: "The count continues..." });

      const msg = await message.channel.send({ embeds: [shieldEmbed] });
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return; // Count is not reset, streak continues
    }

    // ---- Premium Streak Freeze (once per day) ----
    const isPremium = await db.get(`premium:user:${userId}`);
    if (isPremium) {
      const freezeKey = `counting:freeze:${userId}`;
      const lastFreeze = await db.get(freezeKey);
      if (!lastFreeze || (Date.now() - Number(lastFreeze) > 24 * 60 * 60 * 1000)) {
        // Activate freeze
        await db.set(freezeKey, Date.now());

        const freezeEmbed = new EmbedBuilder()
          .setColor("#00AAFF")
          .setTitle("❄️ Premium Streak Freeze")
          .setDescription(`**${message.author.username}**'s premium streak freeze saved their streak!`)
          .addFields(
            { name: "Expected Number", value: `${expected}`, inline: true }
          )
          .setFooter({ text: "The count continues..." });

        const msg = await message.channel.send({ embeds: [freezeEmbed] });
        setTimeout(() => msg.delete().catch(() => {}), 5000);
        return; // Count is not reset
      }
    }

    // No protection – reset the count
    await db.set(nextKey, 1); // Reset count
    await db.del(`counting:${guildId}:${userId}:streak`);
    await db.zincrby(`counting:${guildId}:mistakes`, 1, userId);
    await db.del(`counting:${guildId}:last`);

    const embed = new EmbedBuilder()
      .setColor("#ED4245")
      .setTitle("❌ Wrong Number!")
      .setDescription(
        `**${message.author.username}** broke the chain.\n` +
        `The correct number was **${expected}**, but they sent **${userNumber}**.`
      )
      .addFields(
        { name: "Count Reset", value: "Back to **1**" }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ---- CORRECT COUNT ----
  await db.set(nextKey, expected + 1);
  await db.set(`counting:${guildId}:last`, userId);

  // Streak handling
  const streakKey = `counting:${guildId}:${userId}:streak`;
  const bestKey = `counting:${guildId}:${userId}:bestStreak`;
  let streak = Number(await db.get(streakKey) || 0);
  streak++;
  await db.set(streakKey, streak);
  let best = Number(await db.get(bestKey) || 0);
  if (streak > best) {
    best = streak;
    await db.set(bestKey, best);
  }

  await db.zincrby(`counting:${guildId}:correct`, 1, userId);

  // No coins rewarded – removed entirely.

  await message.react("✅").catch(() => {});

  // ---- Achievements & Activity (optional, keep if you have the utils) ----
  // Import grantAchievement / addActivity from your utils if you still use them.
  // await grantAchievement(db, userId, 'first_count');
  // ...

  // ---- Streak milestones ----
  if (streak === 50 || streak === 100 || streak === 200 || streak === 300 || streak === 350) {
    const milestoneEmbed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("🔥 On fire keep going!")
      .setDescription(`${message.author.username} reached a **${streak}** count streak!`)
      .setTimestamp();
    await message.channel.send({ embeds: [milestoneEmbed] });
  }
};

// commands/giveaway.js – Full with corrected Redis methods
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Giveaways",
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("🎉 Manage giveaways")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("create")
        .setDescription("Create a giveaway")
        .addStringOption(opt =>
          opt.setName("prize")
            .setDescription("What's the prize?")
            .setRequired(true)
            .setMaxLength(200)
        )
        .addStringOption(opt =>
          opt.setName("duration")
            .setDescription("Duration (e.g., 1h, 2d, 30m)")
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName("winners")
            .setDescription("Number of winners (max depends on premium)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
        )
        .addRoleOption(opt =>
          opt.setName("required_role")
            .setDescription("Require a specific role to enter (premium feature)")
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName("max_participants")
            .setDescription("Max total entries (Guild Premium feature)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(1000)
        )
        .addStringOption(opt =>
          opt.setName("color")
            .setDescription("Hex color code (e.g., #FF0000) – Guild Premium")
            .setRequired(false)
        )
        .addRoleOption(opt =>
          opt.setName("ping_role")
            .setDescription("Role to ping when giveaway starts – Guild Premium")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName("end")
        .setDescription("End a giveaway early")
        .addStringOption(opt =>
          opt.setName("message_id")
            .setDescription("Message ID of the giveaway")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("reroll")
        .setDescription("Reroll winners")
        .addStringOption(opt =>
          opt.setName("message_id")
            .setDescription("Message ID of the giveaway")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("List active giveaways")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // ---------- HELPERS ----------
    const isGuildPremium = async () => {
      const val = await redis.get(`premium:guild:${guildId}`);
      return val !== null && val !== undefined;
    };

    const getActiveGiveaways = async () => {
      const keys = await redis.keys(`giveaway:${guildId}:*`);
      const giveaways = [];
      for (const key of keys) {
        const data = await redis.hGetAll(key);
        if (data && data.endTime > Date.now()) {
          giveaways.push({ key, ...data });
        }
      }
      return giveaways;
    };

    // =========================
    // 🎉 CREATE
    // =========================
    if (sub === "create") {
      const prize = interaction.options.getString("prize");
      const durationStr = interaction.options.getString("duration");
      const winners = interaction.options.getInteger("winners") || 1;
      const requiredRole = interaction.options.getRole("required_role") || null;
      const maxParticipants = interaction.options.getInteger("max_participants") || 0;
      const color = interaction.options.getString("color") || "#FF69B4";
      const pingRole = interaction.options.getRole("ping_role") || null;

      const guildPremium = await isGuildPremium();

      // --- Premium checks (same as before) ---
      if (winners > 1 && !guildPremium) {
        return interaction.reply({ content: "❌ Multiple winners is a **Guild Premium** feature. Only 1 winner allowed without premium.", flags: MessageFlags.Ephemeral });
      }
      if (requiredRole && !guildPremium) {
        return interaction.reply({ content: "❌ Required role is a **Guild Premium** feature.", flags: MessageFlags.Ephemeral });
      }
      if (maxParticipants > 0 && !guildPremium) {
        return interaction.reply({ content: "❌ Max participants is a **Guild Premium** feature.", flags: MessageFlags.Ephemeral });
      }
      if (color && !/^#[0-9A-F]{6}$/i.test(color)) {
        return interaction.reply({ content: "❌ Invalid hex color. Use format `#FF0000`.", flags: MessageFlags.Ephemeral });
      }
      if (color !== "#FF69B4" && !guildPremium) {
        return interaction.reply({ content: "❌ Custom color is a **Guild Premium** feature.", flags: MessageFlags.Ephemeral });
      }
      if (pingRole && !guildPremium) {
        return interaction.reply({ content: "❌ Ping role is a **Guild Premium** feature.", flags: MessageFlags.Ephemeral });
      }

      const match = durationStr.match(/^(\d+)([dhm])$/);
      if (!match) return interaction.reply({ content: "❌ Invalid duration format. Use `1h`, `2d`, `30m`.", flags: MessageFlags.Ephemeral });
      const amount = parseInt(match[1]);
      const unit = match[2];
      let seconds = 0;
      if (unit === 'h') seconds = amount * 3600;
      else if (unit === 'd') seconds = amount * 86400;
      else if (unit === 'm') seconds = amount * 60;

      const maxStandard = 86400;
      const maxPremium = 604800;
      if (seconds > maxStandard && !guildPremium) {
        return interaction.reply({ content: `❌ Maximum duration without premium is 1 day (24h). You entered ${durationStr}.`, flags: MessageFlags.Ephemeral });
      }
      if (seconds > maxPremium) {
        return interaction.reply({ content: "❌ Maximum duration is 7 days.", flags: MessageFlags.Ephemeral });
      }

      const activeGiveaways = await getActiveGiveaways();
      if (!guildPremium && activeGiveaways.length >= 1) {
        return interaction.reply({ content: "❌ Without premium, you can only have 1 active giveaway. Upgrade to Guild Premium for unlimited.", flags: MessageFlags.Ephemeral });
      }

      const endTime = Date.now() + seconds * 1000;
      const embed = buildGiveawayEmbed(prize, interaction.user, endTime, winners, requiredRole, maxParticipants, color);

      const giveawayMsg = await interaction.channel.send({ embeds: [embed] });
      await giveawayMsg.react('🎉');

      if (pingRole) {
        await interaction.channel.send({ content: `${pingRole}`, allowedMentions: { roles: [pingRole.id] } });
      }

      const key = `giveaway:${guildId}:${interaction.channel.id}:${giveawayMsg.id}`;
      await redis.hSet(key, {
        prize,
        host: userId,
        channelId: interaction.channel.id,
        messageId: giveawayMsg.id,
        endTime: endTime,
        winners: winners,
        requiredRole: requiredRole ? requiredRole.id : '',
        maxParticipants: maxParticipants || 0,
        ended: 'false',
        participantCount: 0,
        color: color,
        updatedAt: Date.now(),
      });
      await redis.del(`giveaway:${key}:participants`);
      // Use zAdd (v4)
      await redis.zAdd('giveaway:ending', { score: endTime, value: key });

      scheduleGiveawayUpdate(giveawayMsg, key, client, redis);

      return interaction.reply({
        content: `✅ Giveaway created! It ends in ${durationStr}. React with 🎉 to enter.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // =========================
    // 📋 LIST
    // =========================
    if (sub === "list") {
      const active = await getActiveGiveaways();
      if (active.length === 0) {
        return interaction.reply({ content: "📭 No active giveaways.", flags: MessageFlags.Ephemeral });
      }
      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("Active Giveaways")
        .setDescription(active.map(g => `**${g.prize}** – <t:${Math.floor(g.endTime / 1000)}:R> in <#${g.channelId}> (${g.participantCount || 0} entries)`).join("\n"))
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // =========================
    // 🛑 END
    // =========================
    if (sub === "end") {
      const msgId = interaction.options.getString("message_id");
      const channel = interaction.channel;
      let message;
      try {
        message = await channel.messages.fetch(msgId);
      } catch {
        return interaction.reply({ content: "❌ Could not find that message.", flags: MessageFlags.Ephemeral });
      }
      const key = `giveaway:${guildId}:${channel.id}:${msgId}`;
      const data = await redis.hGetAll(key);
      if (!data || data.ended === 'true') {
        return interaction.reply({ content: "❌ Giveaway not found or already ended.", flags: MessageFlags.Ephemeral });
      }
      await endGiveaway(key, data, message, client, redis);
      return interaction.reply({ content: "✅ Giveaway ended.", flags: MessageFlags.Ephemeral });
    }

    // =========================
    // 🔄 REROLL
    // =========================
    if (sub === "reroll") {
      const msgId = interaction.options.getString("message_id");
      const channel = interaction.channel;
      let message;
      try {
        message = await channel.messages.fetch(msgId);
      } catch {
        return interaction.reply({ content: "❌ Could not find that message.", flags: MessageFlags.Ephemeral });
      }
      const key = `giveaway:${guildId}:${channel.id}:${msgId}`;
      const data = await redis.hGetAll(key);
      if (!data || data.ended !== 'true') {
        return interaction.reply({ content: "❌ Giveaway not found or not ended yet.", flags: MessageFlags.Ephemeral });
      }
      const users = await getParticipants(key, redis);
      const requiredRole = data.requiredRole ? await interaction.guild.roles.fetch(data.requiredRole).catch(() => null) : null;
      let eligible = users;
      if (requiredRole) {
        eligible = users.filter(id => interaction.guild.members.cache.get(id)?.roles.cache.has(requiredRole.id));
      }
      if (eligible.length === 0) {
        return interaction.reply({ content: "❌ No eligible users to reroll.", flags: MessageFlags.Ephemeral });
      }
      const winnerCount = parseInt(data.winners) || 1;
      const winners = [];
      for (let i = 0; i < Math.min(winnerCount, eligible.length); i++) {
        const idx = Math.floor(Math.random() * eligible.length);
        winners.push(eligible.splice(idx, 1)[0]);
      }
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("🎉 New Winner(s)!")
        .setDescription(`**Prize:** ${data.prize}\n**Winners:** ${winners.map(id => `<@${id}>`).join(', ')}`)
        .setTimestamp();
      await channel.send({ embeds: [embed] });
      return interaction.reply({ content: "✅ Rerolled winners.", flags: MessageFlags.Ephemeral });
    }
  }
};

// ---------- Helper Functions ----------
function buildGiveawayEmbed(prize, host, endTime, winners, requiredRole, maxParticipants, color) {
  const embed = new EmbedBuilder()
    .setColor(color || "#FF69B4")
    .setTitle("🎉 Giveaway!")
    .setDescription(`**Prize:** ${prize}\n**Hosted by:** ${host}\n**Ends:** <t:${Math.floor(endTime / 1000)}:R>\n**Winners:** ${winners}`)
    .setFooter({ text: `React with 🎉 to enter!` })
    .setTimestamp();

  if (requiredRole) embed.addFields({ name: "Required Role", value: `${requiredRole}`, inline: true });
  if (maxParticipants > 0) embed.addFields({ name: "Max Entries", value: `${maxParticipants}`, inline: true });

  return embed;
}

async function updateGiveawayEmbed(message, key, redis) {
  const data = await redis.hGetAll(key);
  if (!data || data.ended === 'true') return;

  const participants = await getParticipants(key, redis);
  const participantCount = participants.length;

  const embed = EmbedBuilder.from(message.embeds[0])
    .setDescription(
      `**Prize:** ${data.prize}\n**Hosted by:** <@${data.host}>\n**Ends:** <t:${Math.floor(data.endTime / 1000)}:R>\n**Winners:** ${data.winners}\n**Entries:** ${participantCount}`
    )
    .setFooter({ text: `React with 🎉 to enter! (${participantCount} entries)` });

  await message.edit({ embeds: [embed] });
  await redis.hSet(key, 'updatedAt', Date.now());
}

function scheduleGiveawayUpdate(message, key, client, redis) {
  const interval = setInterval(async () => {
    const data = await redis.hGetAll(key);
    if (!data || data.ended === 'true') {
      clearInterval(interval);
      return;
    }
    await updateGiveawayEmbed(message, key, redis);
  }, 60000);

  if (!client.giveawayIntervals) client.giveawayIntervals = new Map();
  client.giveawayIntervals.set(key, interval);
}

async function getParticipants(key, redis) {
  return await redis.smembers(`giveaway:${key}:participants`);
}

async function getUsersWhoReacted(message, emoji) {
  const reaction = message.reactions.cache.get(emoji);
  if (!reaction) return [];
  const users = await reaction.users.fetch();
  return users.filter(u => !u.bot).map(u => u.id);
}

async function endGiveaway(key, data, message, client, redis) {
  await redis.hSet(key, 'ended', 'true');
  const users = await getParticipants(key, redis);
  const reactedUsers = await getUsersWhoReacted(message, '🎉');
  const allUsers = [...new Set([...users, ...reactedUsers])];
  await redis.hSet(key, 'participantCount', allUsers.length);

  const requiredRole = data.requiredRole ? await message.guild.roles.fetch(data.requiredRole).catch(() => null) : null;
  let eligible = allUsers;
  if (requiredRole) {
    eligible = eligible.filter(id => message.guild.members.cache.get(id)?.roles.cache.has(requiredRole.id));
  }
  const winnerCount = parseInt(data.winners) || 1;
  const winners = [];
  for (let i = 0; i < Math.min(winnerCount, eligible.length); i++) {
    const idx = Math.floor(Math.random() * eligible.length);
    winners.push(eligible.splice(idx, 1)[0]);
  }

  const embed = EmbedBuilder.from(message.embeds[0])
    .setColor("#ED4245")
    .setTitle("🎉 Giveaway Ended!")
    .setDescription(
      `**Prize:** ${data.prize}\n**Hosted by:** <@${data.host}>\n**Total Entries:** ${allUsers.length}\n**Winners:** ${winners.length ? winners.map(id => `<@${id}>`).join(', ') : 'No valid entries.'}`
    )
    .setFooter({ text: "Giveaway ended" });

  await message.edit({ embeds: [embed] });
  await redis.zRem('giveaway:ending', key);

  if (client.giveawayIntervals && client.giveawayIntervals.has(key)) {
    clearInterval(client.giveawayIntervals.get(key));
    client.giveawayIntervals.delete(key);
  }

  for (const winnerId of winners) {
    try {
      const user = await client.users.fetch(winnerId);
      await user.send(`🎉 Congratulations! You won the giveaway for **${data.prize}**!`);
    } catch {}
  }
}

module.exports.endGiveaway = endGiveaway;
module.exports.getParticipants = getParticipants;
module.exports.updateGiveawayEmbed = updateGiveawayEmbed;
module.exports.scheduleGiveawayUpdate = scheduleGiveawayUpdate;

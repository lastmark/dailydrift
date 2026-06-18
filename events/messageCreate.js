// events/messageCreate.js – SIMPLIFIED WORKING VERSION (hardcoded aliases)
const { Events, EmbedBuilder, MessageFlags } = require("discord.js");

const DEV_ID = "1303357369622990889";
const DEFAULT_PREFIXES = ['!', '?'];

// Helper: convert duration string to seconds
function durationToSeconds(input) {
  if (input === "perm") return -1;
  const match = input.match(/(\d+)(d|h|m)/);
  if (!match) return 0;
  const value = parseInt(match[1]);
  const type = match[2];
  if (type === "d") return value * 86400;
  if (type === "h") return value * 3600;
  if (type === "m") return value * 60;
  return 0;
}

// ---------- SIMPLE fake interaction builder (for commands with subcommands) ----------
function buildFakeInteraction(message, commandName, subcommandName, options = {}) {
  const fake = {
    user: message.author,
    member: message.member,
    guild: message.guild,
    channel: message.channel,
    client: message.client,
    reply: message.reply.bind(message),
    editReply: message.editReply ? message.editReply.bind(message) : message.reply.bind(message),
    deferReply: async () => {},
    followUp: message.reply.bind(message),
    fetchReply: async () => message,
    options: {
      getSubcommand: () => subcommandName || null,
      getSubcommandGroup: () => null,
      getString: (name) => options[name] || null,
      getInteger: (name) => options[name] ? parseInt(options[name]) : null,
      getBoolean: (name) => options[name] ? options[name] === 'true' || options[name] === '1' : null,
      getUser: async (name) => {
        const val = options[name];
        if (!val) return null;
        const id = val.match(/<@!?(\d+)>/)?.[1] || val;
        return await message.client.users.fetch(id).catch(() => null);
      },
      getChannel: async (name) => {
        const val = options[name];
        if (!val) return null;
        const id = val.match(/<#(\d+)>/)?.[1] || val;
        return await message.guild.channels.fetch(id).catch(() => null);
      },
      getRole: async (name) => {
        const val = options[name];
        if (!val) return null;
        const id = val.match(/<@&(\d+)>/)?.[1] || val;
        return await message.guild.roles.fetch(id).catch(() => null);
      },
      getAttachment: (name) => null,
      getNumber: (name) => options[name] ? parseFloat(options[name]) : null,
    },
    isChatInputCommand: () => true,
    isRepliable: () => true,
    customId: null,
    createdTimestamp: Date.now(),
    id: message.id,
    type: 2,
  };
  return fake;
}

// Message cache to prevent duplicate processing
const processedMessages = new Set();

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client, redis) {
    // Basic checks
    if (!message.guild || message.author.bot) return;

    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 5000);

    const userId = message.author.id;
    const guildId = message.guild.id;
    const content = message.content;

    // ==========================================
    // 🔥 COUNTING GAME – if in counting channel
    // ==========================================
    try {
      const countingChannelId = await redis.get(`counting:${guildId}:channel`);
      if (countingChannelId && message.channel.id === countingChannelId) {
        const pure = content.replace(/\s+/g, "");
        const isValid = /^[0-9+\-*/^()]+$/.test(pure);
        if (!isValid) {
          if (message.deletable) await message.delete().catch(() => {});
          return;
        }
        const runCounting = require("../games/counting.js");
        await runCounting(message, redis);
        return;
      }
    } catch (err) {
      console.error("Counting game error:", err);
    }

    // ==========================================
    // 🚨 Special: hardcoded !prefix command (always works)
    // ==========================================
    if (content.startsWith("!prefix") || content.startsWith("?prefix")) {
      const args = content.slice(1).trim().split(/ +/);
      const cmd = args[0].toLowerCase();
      const member = message.member;
      if (!member.permissions.has("ManageGuild")) {
        return message.reply("❌ You need **Manage Server** permission to change the prefix.");
      }
      if (args.length < 2) {
        return message.reply("Usage: `!prefix set <newprefix>` or `!prefix reset`");
      }
      const action = args[1];
      if (action === "set") {
        const newPrefix = args[2];
        if (!newPrefix) return message.reply("❌ Please provide a new prefix.");
        await redis.set(`prefix:${guildId}`, newPrefix);
        return message.reply(`✅ Prefix set to \`${newPrefix}\`.`);
      } else if (action === "reset") {
        await redis.del(`prefix:${guildId}`);
        return message.reply(`✅ Prefix reset to defaults: \`!\` and \`?\`.`);
      } else {
        return message.reply("Usage: `!prefix set <newprefix>` or `!prefix reset`");
      }
    }

    // ==========================================
    // 💬 PREFIX COMMANDS (custom or default)
    // ==========================================
    const customPrefix = await redis.get(`prefix:${guildId}`);
    const prefixes = customPrefix ? [customPrefix] : DEFAULT_PREFIXES;
    const usedPrefix = prefixes.find(p => content.startsWith(p));
    if (!usedPrefix) {
      // No prefix – skip to XP later
    }

    if (usedPrefix) {
      const args = content.slice(usedPrefix.length).trim().split(/ +/);
      const cmd = args.shift().toLowerCase();

      // -------- HARDCODED PUBLIC COMMANDS --------
      if (cmd === "shop") {
        const balance = Number(await redis.get(`eco:${userId}:money`) || 0);
        const shields = Number(await redis.get(`eco:${userId}:shield`) || 0);
        const doubleXP = Number(await redis.get(`eco:${userId}:double`) || 0);

        const embed = new EmbedBuilder()
          .setColor("#FF69B4")
          .setTitle("🛒 Counting Shop")
          .setDescription(`💰 Your balance: **${balance}** coins`)
          .addFields(
            { 
              name: "🛡️ Shield", 
              value: `Protects your streak from one mistake\nPrice: **200** coins\nOwned: **${shields}**`,
              inline: true 
            },
            { 
              name: "⚡ Double XP", 
              value: `Double coins for 5 correct counts\nPrice: **500** coins\nActive: **${doubleXP > 0 ? 'Yes' : 'No'}**`,
              inline: true 
            }
          )
          .setFooter({ text: "Use !buy shield / !buy double" })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      if (cmd === "buy") {
        const item = args[0]?.toLowerCase();
        if (!item || !["shield", "double"].includes(item)) {
          return message.reply("❌ Usage: `buy shield` or `buy double`");
        }

        const prices = { shield: 200, double: 500 };
        const price = prices[item];
        const balance = Number(await redis.get(`eco:${userId}:money`) || 0);

        if (balance < price) {
          return message.reply(`❌ You need **${price}** coins. You have **${balance}**.`);
        }

        await redis.set(`eco:${userId}:money`, balance - price);

        if (item === "shield") {
          await redis.incr(`eco:${userId}:shield`);
          const newShields = await redis.get(`eco:${userId}:shield`);
          return message.reply(`✅ You bought a **Shield**! You now have **${newShields}** shields.`);
        } else if (item === "double") {
          await redis.set(`eco:${userId}:double`, 5);
          return message.reply(`✅ You bought **Double XP** for 5 counts!`);
        }
      }

      if (cmd === "shields") {
        const shields = Number(await redis.get(`eco:${userId}:shield`) || 0);
        return message.reply(`🛡️ You have **${shields}** shield${shields !== 1 ? 's' : ''}.`);
      }

      if (cmd === "countingstats") {
        const target = message.mentions.users.first() || message.author;
        const id = target.id;
        const correct = Number(await redis.zscore(`counting:${guildId}:correct`, id) || 0);
        const mistakes = Number(await redis.zscore(`counting:${guildId}:mistakes`, id) || 0);
        const streak = Number(await redis.get(`counting:${guildId}:${id}:streak`) || 0);
        const best = Number(await redis.get(`counting:${guildId}:${id}:bestStreak`) || 0);
        const coins = Number(await redis.get(`eco:${id}:money`) || 0);

        const embed = new EmbedBuilder()
          .setColor("#5865F2")
          .setAuthor({ name: `${target.username}'s Counting Stats`, iconURL: target.displayAvatarURL() })
          .addFields(
            { name: "✅ Correct", value: `${correct}`, inline: true },
            { name: "❌ Mistakes", value: `${mistakes}`, inline: true },
            { name: "🔥 Current Streak", value: `${streak}`, inline: true },
            { name: "🏆 Best Streak", value: `${best}`, inline: true },
            { name: "💰 Coins", value: `${coins}`, inline: true }
          )
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      // -------- DEV COMMANDS (only you) --------
      if (userId === DEV_ID) {
        // Economy
        if (cmd === "addcoins") {
          const target = message.mentions.users.first();
          const amount = parseInt(args[1]);
          if (!target || isNaN(amount) || amount < 1)
            return message.reply("❌ Usage: `addcoins @user amount`");
          await redis.incrby(`eco:${target.id}:money`, amount);
          const bal = await redis.get(`eco:${target.id}:money`) || 0;
          return message.reply(`✅ Added **${amount}** coins to **${target.username}**. New balance: **${bal}**`);
        }

        if (cmd === "removecoins") {
          const target = message.mentions.users.first();
          const amount = parseInt(args[1]);
          if (!target || isNaN(amount) || amount < 1)
            return message.reply("❌ Usage: `removecoins @user amount`");
          const current = Number(await redis.get(`eco:${target.id}:money`) || 0);
          if (current < amount) return message.reply(`❌ ${target.username} only has ${current} coins.`);
          await redis.decrby(`eco:${target.id}:money`, amount);
          const bal = await redis.get(`eco:${target.id}:money`) || 0;
          return message.reply(`✅ Removed **${amount}** coins. New balance: **${bal}**`);
        }

        if (cmd === "setbalance") {
          const target = message.mentions.users.first();
          const amount = parseInt(args[1]);
          if (!target || isNaN(amount) || amount < 0)
            return message.reply("❌ Usage: `setbalance @user amount`");
          await redis.set(`eco:${target.id}:money`, amount);
          return message.reply(`✅ Set **${target.username}**'s balance to **${amount}** coins`);
        }

        // Shields
        if (cmd === "addshields") {
          const target = message.mentions.users.first();
          const amount = parseInt(args[1]);
          if (!target || isNaN(amount) || amount < 1)
            return message.reply("❌ Usage: `addshields @user amount`");
          await redis.incrby(`eco:${target.id}:shield`, amount);
          const shields = await redis.get(`eco:${target.id}:shield`) || 0;
          return message.reply(`✅ Added **${amount}** shields. Total: **${shields}**`);
        }

        if (cmd === "removeshields") {
          const target = message.mentions.users.first();
          const amount = parseInt(args[1]);
          if (!target || isNaN(amount) || amount < 1)
            return message.reply("❌ Usage: `removeshields @user amount`");
          const current = Number(await redis.get(`eco:${target.id}:shield`) || 0);
          if (current < amount) return message.reply(`❌ ${target.username} only has ${current} shields.`);
          await redis.decrby(`eco:${target.id}:shield`, amount);
          const shields = await redis.get(`eco:${target.id}:shield`) || 0;
          return message.reply(`✅ Removed **${amount}** shields. Remaining: **${shields}**`);
        }

        // Premium
        if (cmd === "removepremium") {
          const target = message.mentions.users.first();
          if (!target) return message.reply("❌ Usage: `removepremium @user`");
          await redis.del(`premium:user:${target.id}`);
          await redis.del(`eco:${target.id}:vip`);
          return message.reply(`✅ Removed user premium from **${target.username}**`);
        }

        if (cmd === "removeguildpremium") {
          await redis.del(`premium:guild:${guildId}`);
          return message.reply(`✅ Removed guild premium for this server.`);
        }

        if (cmd === "checkpremium") {
          const userKey = `premium:user:${userId}`;
          const guildKey = `premium:guild:${guildId}`;
          const userVal = await redis.get(userKey);
          const userTTL = await redis.ttl(userKey);
          const guildVal = await redis.get(guildKey);
          const guildTTL = await redis.ttl(guildKey);
          return message.reply(
            `👤 **User Premium**\nValue: ${userVal || '❌ none'}\nTTL: ${userTTL}s\n\n` +
            `🏢 **Guild Premium**\nValue: ${guildVal || '❌ none'}\nTTL: ${guildTTL}s`
          );
        }

        if (cmd === "setpremium") {
          const duration = args[0] || "1h";
          const seconds = durationToSeconds(duration);
          if (seconds === 0 && duration !== "perm") return message.reply("Invalid duration.");
          const key = `premium:user:${userId}`;
          if (duration === "perm") {
            await redis.set(key, "perm");
          } else {
            await redis.set(key, "active");
            await redis.expire(key, seconds);
          }
          return message.reply(`✅ User premium set for you (${duration}). Check /premium.`);
        }

        if (cmd === "setguildpremium") {
          const duration = args[0] || "1h";
          const seconds = durationToSeconds(duration);
          if (seconds === 0 && duration !== "perm") return message.reply("Invalid duration.");
          const key = `premium:guild:${guildId}`;
          if (duration === "perm") {
            await redis.set(key, "perm");
          } else {
            await redis.set(key, "active");
            await redis.expire(key, seconds);
          }
          return message.reply(`✅ Guild premium set for this server (${duration}).`);
        }

        // Beta Tester
        if (cmd === "addbetatester") {
          const target = message.mentions.users.first();
          if (!target) return message.reply("❌ Usage: `addbetatester @user`");
          await redis.set(`beta:user:${target.id}`, "true");
          return message.reply(`✅ **${target.username}** is now a Beta Tester.`);
        }

        if (cmd === "removebetatester") {
          const target = message.mentions.users.first();
          if (!target) return message.reply("❌ Usage: `removebetatester @user`");
          await redis.del(`beta:user:${target.id}`);
          return message.reply(`✅ Removed Beta Tester status from **${target.username}**.`);
        }

        // Redeem code
        if (cmd === "redeemcode") {
          const code = args[0]?.toUpperCase();
          if (!code) return message.reply("❌ Usage: `redeemcode CODE`");
          const raw = await redis.get(`redeem:${code}`);
          if (!raw) return message.reply("❌ Invalid code.");
          const data = JSON.parse(raw);

          if (data.uses <= 0) {
            await redis.del(`redeem:${code}`);
            return message.reply("❌ Code fully used.");
          }
          if (data.seconds !== -1 && (Date.now() - data.createdAt) > data.seconds * 1000) {
            await redis.del(`redeem:${code}`);
            return message.reply("❌ Code expired.");
          }
          if (data.users && data.users.includes(userId)) {
            return message.reply("❌ You already used this code.");
          }

          const premiumKey = `premium:user:${userId}`;
          if (data.duration === "perm") {
            await redis.set(premiumKey, "perm");
          } else {
            await redis.set(premiumKey, "active");
            await redis.expire(premiumKey, data.seconds);
          }

          if (data.giveCoins && data.coinAmount > 0) {
            await redis.incrby(`eco:${userId}:money`, data.coinAmount);
          }

          data.used++;
          if (!data.users) data.users = [];
          data.users.push(userId);
          if (data.used >= data.uses) {
            await redis.del(`redeem:${code}`);
          } else {
            await redis.set(`redeem:${code}`, JSON.stringify(data));
          }

          return message.reply(`✅ Redeemed **${code}** successfully! Premium activated.`);
        }

        // Counting setup
        if (cmd === "setcountingchannel") {
          const channel = message.mentions.channels.first();
          if (!channel) return message.reply("❌ Usage: `setcountingchannel #channel`");
          await redis.set(`counting:${guildId}:channel`, channel.id);
          await redis.set(`counting:${guildId}:number`, 0);
          return message.reply(`✅ Counting channel set to ${channel}`);
        }

        if (cmd === "resetcounting") {
          const keys = await redis.keys(`counting:${guildId}:*`);
          for (const key of keys) await redis.del(key);
          await redis.set(`counting:${guildId}:number`, 0);
          return message.reply("✅ All counting stats reset.");
        }

        // Help
        if (cmd === "helpdev") {
          const embed = new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle("👑 Dev Commands")
            .setDescription("All commands use `!` prefix")
            .addFields(
              { name: "💰 Economy", value: [
                "`addcoins @user amount`",
                "`removecoins @user amount`",
                "`setbalance @user amount`"
              ].join("\n"), inline: false },
              { name: "🛡️ Shields", value: [
                "`addshields @user amount`",
                "`removeshields @user amount`"
              ].join("\n"), inline: false },
              { name: "👑 Premium", value: [
                "`removepremium @user`",
                "`removeguildpremium`",
                "`checkpremium`",
                "`setpremium 1h`",
                "`setguildpremium 1h`",
                "`redeemcode CODE`"
              ].join("\n"), inline: false },
              { name: "🧪 Beta Tester", value: [
                "`addbetatester @user`",
                "`removebetatester @user`"
              ].join("\n"), inline: false },
              { name: "🎯 Counting", value: [
                "`setcountingchannel #channel`",
                "`resetcounting`",
                "`countingstats @user`"
              ].join("\n"), inline: false }
            )
            .setTimestamp();
          return message.reply({ embeds: [embed] });
        }

        // Testing
        if (cmd === "devv") {
          const sub = args[0];
          if (sub === "xp") {
            await redis.hset(`profile:${userId}`, "xp", 0);
            await redis.hset(`profile:${userId}`, "level", 3);
            return message.reply("XP reset for testing.");
          }
          if (sub === "coins") {
            await redis.set(`eco:${userId}:money`, 10000);
            return message.reply("Coins set to 10,000.");
          }
          return message.reply("Usage: devv xp | coins");
        }
      }

      // ==========================================
      // 🎯 ALIAS HANDLER (hardcoded for common commands)
      // ==========================================
      let slashCommand = null;
      let subcommand = null;
      let options = {};

      // Parse options from remaining args
      const optionArgs = [...args];
      
      // --- ALIAS MAP ---
      const aliasMap = {
        // Games
        'blackjack': { cmd: 'games', sub: 'blackjack' },
        'bj': { cmd: 'games', sub: 'blackjack' },
        'rps': { cmd: 'games', sub: 'rps' },
        'coinflip': { cmd: 'games', sub: 'coinflip' },
        'dice': { cmd: 'games', sub: 'dice' },
        'slots': { cmd: 'games', sub: 'slots' },
        'daily': { cmd: 'games', sub: 'daily' },
        'game_stats': { cmd: 'games', sub: 'stats' },
        // Profile
        'profile': { cmd: 'profile', sub: 'view' },
        'setbio': { cmd: 'profile', sub: 'setbio' },
        'setcolor': { cmd: 'profile', sub: 'setcolor' },
        'upload': { cmd: 'profile', sub: 'upload' },
        'profile_reset': { cmd: 'profile', sub: 'reset' },
        // Counting
        'counting': { cmd: 'counting', sub: 'stats' },
        'countingsetup': { cmd: 'counting', sub: 'setup' },
        'countingleaderboard': { cmd: 'counting', sub: 'leaderboard' },
        'countingshop': { cmd: 'counting', sub: 'shop' },
        'countingreset': { cmd: 'counting', sub: 'reset' },
        // Premium
        'premium': { cmd: 'premium', sub: null },
      };

      const alias = aliasMap[cmd];
      if (alias) {
        slashCommand = client.commands.get(alias.cmd);
        subcommand = alias.sub;
        // Parse remaining args into options based on the slash command's options
        // For simplicity, we'll just pass them as positionals.
        // But for commands like !blackjack 100, we need to map 'bet' to 100.
        // We'll do a simple mapping for each command.
        if (subcommand === 'blackjack' || subcommand === 'rps' || subcommand === 'coinflip' || subcommand === 'dice' || subcommand === 'slots') {
          if (optionArgs.length > 0) {
            // For games, the first arg is usually 'bet' (except rps has choice then bet)
            if (subcommand === 'rps') {
              if (optionArgs.length >= 2) {
                options.choice = optionArgs[0];
                options.bet = optionArgs[1];
              }
            } else {
              options.bet = optionArgs[0];
            }
          }
        } else if (subcommand === 'stats' || subcommand === 'view') {
          // For profile view, if there's a mention, use it as 'user'
          const mention = message.mentions.users.first();
          if (mention) options.user = mention.id;
        } else if (subcommand === 'setbio') {
          options.text = optionArgs.join(' ');
        } else if (subcommand === 'setcolor') {
          options.color = optionArgs[0];
        } else if (subcommand === 'upload') {
          // Not supported via prefix (needs attachment)
        } else if (subcommand === 'reset') {
          // no options
        } else if (subcommand === 'setup') {
          // For counting setup, need channel
          const channel = message.mentions.channels.first();
          if (channel) options.channel = channel.id;
        } else if (subcommand === 'shop' || subcommand === 'leaderboard') {
          // no options
        }
      }

      if (slashCommand) {
        try {
          const fake = buildFakeInteraction(message, alias.cmd, subcommand, options);
          await slashCommand.execute(fake, client, redis);
        } catch (err) {
          console.error(`Error executing alias ${cmd}:`, err);
          await message.reply({ content: `❌ Error: ${err.message}`, flags: MessageFlags.Ephemeral });
        }
        return;
      }

      // ==========================================
      // 🚀 FALLBACK: Try generic slash command lookup
      // ==========================================
      const fallbackCommand = client.commands.get(cmd);
      if (fallbackCommand) {
        try {
          // For top-level commands (like /premium), just pass options as-is
          const fake = buildFakeInteraction(message, cmd, null, {});
          // We need to handle options for the fallback too – but we'll just let it work without options.
          // This is a best-effort.
          await fallbackCommand.execute(fake, client, redis);
        } catch (err) {
          console.error(`Error executing fallback command ${cmd}:`, err);
          await message.reply({ content: `❌ Error: ${err.message}`, flags: MessageFlags.Ephemeral });
        }
        return;
      }

      // If nothing matches, do nothing.
      return;
    }

    // ==========================================
    // 💎 XP / LEVEL SYSTEM (only for non-command messages)
    // ==========================================
    const cooldownKey = `xp:cd:${userId}`;
    if (await redis.get(cooldownKey)) return;
    await redis.setex(cooldownKey, 60, "1");

    const isPremium = await redis.get(`premium:user:${userId}`);

    let xpGain = Math.floor(Math.random() * 11) + 15;
    if (isPremium) xpGain = Math.floor(xpGain * 1.8);

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

    // ==========================================
    // 🤖 AUTO RESPONDER
    // ==========================================
    const key = content.toLowerCase().trim();
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
  }
};

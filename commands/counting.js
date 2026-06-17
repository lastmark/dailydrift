// commands/counting.js - FIXED WITH NULL CHECKS
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("counting")
    .setDescription("Advanced counting system")
    .addSubcommand(s =>
      s.setName("setup")
        .setDescription("Setup the counting channel")
        .addChannelOption(o =>
          o.setName("channel")
            .setDescription("Select an existing channel")
            .addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption(o =>
          o.setName("auto_create")
            .setDescription("Auto-create a counting channel")
        )
    )
    .addSubcommand(s =>
      s.setName("stats")
        .setDescription("View your stats")
        .addUserOption(o =>
          o.setName("target")
            .setDescription("View another user's stats")
        )
    )
    .addSubcommand(s =>
      s.setName("leaderboard")
        .setDescription("Top players")
        .addStringOption(o =>
          o.setName("type")
            .setDescription("Leaderboard type")
            .addChoices(
              { name: "Most Correct", value: "correct" },
              { name: "Best Streak", value: "streak" }
            )
        )
    )
    .addSubcommand(s =>
      s.setName("shop")
        .setDescription("Buy items")
    ),

  async execute(interaction, client, redis) {
    try {
      // CHECK IF IN GUILD
      if (!interaction.guild) {
        return interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: MessageFlags.Ephemeral
        });
      }

      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      // =========================
      // ⚙️ SETUP
      // =========================
      if (sub === "setup") {
        // Check admin
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({
            content: "❌ You need Administrator permission.",
            flags: MessageFlags.Ephemeral
          });
        }

        const channel = interaction.options.getChannel("channel");
        const autoCreate = interaction.options.getBoolean("auto_create") || false;

        let targetChannel = channel;

        if (!targetChannel && autoCreate) {
          try {
            targetChannel = await interaction.guild.channels.create({
              name: "counting-game",
              type: ChannelType.GuildText,
              topic: "Counting Game Channel"
            });
          } catch (error) {
            return interaction.reply({
              content: `❌ Failed to create channel: ${error.message}`,
              flags: MessageFlags.Ephemeral
            });
          }
        }

        if (!targetChannel) {
          return interaction.reply({
            content: "❌ Please select a channel or enable auto-create.",
            flags: MessageFlags.Ephemeral
          });
        }

        await redis.set(`counting:${guildId}:channel`, targetChannel.id);
        
        if (!await redis.get(`count:${guildId}`)) {
          await redis.set(`count:${guildId}`, 0);
        }

        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle("✅ Setup Complete!")
          .setDescription(`Counting channel: ${targetChannel}`)
          .addFields(
            { name: "Channel", value: `${targetChannel}`, inline: true },
            { name: "Current Count", value: `${await redis.get(`count:${guildId}`) || 0}`, inline: true }
          )
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      // =========================
      // 📊 STATS
      // =========================
      if (sub === "stats") {
        const targetUser = interaction.options.getUser("target") || interaction.user;
        const targetId = targetUser.id;

        const correct = Number(await redis.zscore(`counting:${guildId}:scores`, targetId) || 0);
        const mistakes = Number(await redis.zscore(`counting:${guildId}:sabotages`, targetId) || 0);
        const streak = Number(await redis.get(`counting:${guildId}:${targetId}:streak`) || 0);
        const record = Number(await redis.get(`counting:${guildId}:${targetId}:highscore`) || 0);
        
        const total = correct + mistakes;
        const successRate = total > 0 ? Math.round((correct / total) * 100) : 0;
        const level = Math.floor(correct / 10) + 1;

        const embed = new EmbedBuilder()
          .setColor("#5865F2")
          .setAuthor({
            name: `${targetUser.username}'s Stats`,
            iconURL: targetUser.displayAvatarURL()
          })
          .setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            { 
              name: "Overall", 
              value: `✅ Correct: **${correct}**\n❌ Mistakes: **${mistakes}**\n📈 Rate: **${successRate}%**`,
              inline: true 
            },
            { 
              name: "Streaks", 
              value: `⚡ Current: **${streak}**\n🏆 Record: **${record}**`,
              inline: true 
            },
            { 
              name: "Progress", 
              value: `🏅 Level: **${level}**`,
              inline: true 
            }
          )
          .setFooter({ text: `Total attempts: ${total}` })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      // =========================
      // 🏆 LEADERBOARD
      // =========================
      if (sub === "leaderboard") {
        const type = interaction.options.getString("type") || "correct";
        let data;

        if (type === "correct") {
          data = await redis.zrevrange(`counting:${guildId}:scores`, 0, 9, "WITHSCORES");
        } else {
          const keys = await redis.keys(`counting:${guildId}:*:highscore`);
          const streakData = [];
          for (const key of keys) {
            const id = key.split(":")[2];
            const streak = Number(await redis.get(key) || 0);
            streakData.push({ id, streak });
          }
          streakData.sort((a, b) => b.streak - a.streak);
          data = streakData.slice(0, 10);
        }

        let text = "";
        if (!data || data.length === 0) {
          text = "No data yet.";
        } else {
          const medals = ["🥇", "🥈", "🥉"];
          for (let i = 0; i < data.length; i++) {
            const rank = i + 1;
            let id, value;
            
            if (type === "streak") {
              id = data[i].id;
              value = data[i].streak;
            } else {
              id = data[i];
              value = data[i + 1];
              i++;
            }
            
            const medal = rank <= 3 ? medals[rank - 1] : `#${rank}`;
            const user = await client.users.fetch(id).catch(() => null);
            const username = user ? user.username : id;
            
            text += `${medal} **${username}** — \`${value}\`\n`;
          }
        }

        const embed = new EmbedBuilder()
          .setColor("#FFD700")
          .setTitle(type === "correct" ? "Most Correct" : "Best Streaks")
          .setDescription(text || "No players yet.")
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      // =========================
      // 🛒 SHOP
      // =========================
      if (sub === "shop") {
        const shieldPrice = 200;
        const doublePrice = 500;

        const balanceKey = `eco:${userId}:money`;
        const shieldKey = `eco:${userId}:shield`;
        const doubleKey = `eco:${userId}:double`;
        
        let coins = Number(await redis.get(balanceKey) || 0);
        const shield = Number(await redis.get(shieldKey) || 0);
        const double = Number(await redis.get(doubleKey) || 0);

        const embed = new EmbedBuilder()
          .setColor("#FF69B4")
          .setTitle("Shop")
          .setDescription(`💰 Balance: **${coins}** coins`)
          .addFields(
            { 
              name: "Shield", 
              value: `Protects your streak\nPrice: **${shieldPrice}** coins\nOwned: **${shield}**`,
              inline: true 
            },
            { 
              name: "Double XP", 
              value: `Double points\nPrice: **${doublePrice}** coins\nActive: **${double > 0 ? 'Yes' : 'No'}**`,
              inline: true 
            }
          )
          .setTimestamp();

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("counting_buy_shield")
              .setLabel(`Buy Shield (${shieldPrice} coins)`)
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("counting_buy_double")
              .setLabel(`Buy Double XP (${doublePrice} coins)`)
              .setStyle(ButtonStyle.Success)
          );

        return interaction.reply({ 
          embeds: [embed],
          components: [row]
        });
      }

    } catch (error) {
      console.error("Counting error:", error);
      return interaction.reply({
        content: `❌ Error: ${error.message}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

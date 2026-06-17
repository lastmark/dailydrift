const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("counting")
    .setDescription("📊 Advanced counting system with stats & shop")
    .addSubcommand(s =>
      s.setName("setup")
        .setDescription("Setup the counting channel")
        .addChannelOption(o =>
          o.setName("channel")
            .setDescription("Select an existing channel for counting")
            .addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption(o =>
          o.setName("auto_create")
            .setDescription("Auto-create a counting channel")
        )
        .addBooleanOption(o =>
          o.setName("clear_on_reset")
            .setDescription("Clear channel messages on reset?")
        )
    )
    .addSubcommand(s =>
      s.setName("stats")
        .setDescription("View your full performance stats")
        .addUserOption(o =>
          o.setName("target")
            .setDescription("View another user's stats")
        )
    )
    .addSubcommand(s =>
      s.setName("leaderboard")
        .setDescription("Top players in counting")
        .addStringOption(o =>
          o.setName("type")
            .setDescription("Leaderboard type")
            .addChoices(
              { name: "🏆 Most Correct", value: "correct" },
              { name: "🔥 Best Streak", value: "streak" },
              { name: "📈 Most Improved", value: "improved" }
            )
        )
    )
    .addSubcommand(s =>
      s.setName("shop")
        .setDescription("Buy protection items and power-ups")
    )
    .addSubcommand(s =>
      s.setName("reset")
        .setDescription("Reset your counting stats (admin only)")
    ),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    // =========================
    // ⚙️ SETUP
    // =========================
    if (sub === "setup") {
      // Check permissions
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("❌ You need **Administrator** permission to setup counting.")
          ]
        });
      }

      const channel = interaction.options.getChannel("channel");
      const autoCreate = interaction.options.getBoolean("auto_create") || false;
      const clearOnReset = interaction.options.getBoolean("clear_on_reset") || false;

      // Validate input
      if (!channel && !autoCreate) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("❌ Please select a channel or enable auto-create.")
          ]
        });
      }

      let targetChannel = channel;

      // Auto-create channel
      if (!targetChannel && autoCreate) {
        // Check bot permissions
        const botMember = interaction.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor("#ED4245")
                .setDescription("❌ I need **Manage Channels** permission to create a channel.")
            ]
          });
        }

        try {
          targetChannel = await interaction.guild.channels.create({
            name: "🔢-counting",
            type: ChannelType.GuildText,
            topic: "📊 Counting Game Channel - Keep the count going!",
            permissionOverwrites: [
              {
                id: interaction.guild.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                deny: [PermissionFlagsBits.CreateInstantInvite]
              }
            ]
          });

          // Send welcome message
          await targetChannel.send({
            embeds: [
              new EmbedBuilder()
                .setColor("#5865F2")
                .setTitle("🔢 Counting Game Started!")
                .setDescription("Welcome to the counting game! Start counting from **1**.")
                .addFields(
                  { name: "📝 How to Play", value: "Type the next number in the sequence.\nFirst number should be **1**.", inline: true },
                  { name: "⚠️ Rules", value: "• No double counting\n• Type the correct number\n• Have fun!", inline: true },
                  { name: "💡 Tips", value: "You can also type math expressions!\nExample: `5+5` = 10", inline: true }
                )
                .setFooter({ text: "Good luck and have fun!" })
                .setTimestamp()
            ]
          });
        } catch (error) {
          console.error("Failed to create counting channel:", error);
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor("#ED4245")
                .setDescription("❌ Failed to create counting channel. Check my permissions.")
            ]
          });
        }
      }

      // Save setup data
      await redis.set(`counting:${guildId}:channel`, targetChannel.id);
      await redis.set(`counting:${guildId}:clear_on_reset`, clearOnReset ? "true" : "false");

      // Set initial count if not exists
      const countKey = `count:${guildId}`;
      const existingCount = await redis.get(countKey);
      if (!existingCount) {
        await redis.set(countKey, 0);
      }

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ Counting System Setup Complete!")
        .setDescription(`Counting channel set to ${targetChannel}`)
        .addFields(
          { name: "📢 Channel", value: `${targetChannel}`, inline: true },
          { name: "🔄 Clear on Reset", value: clearOnReset ? "✅ Yes" : "❌ No", inline: true },
          { name: "🔢 Current Count", value: `\`${await redis.get(countKey) || 0}\``, inline: true }
        )
        .setFooter({ text: "Users can now start counting!" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
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
      const shield = Number(await redis.get(`eco:${guildId}:${targetId}:shield`) || 0);
      
      const total = correct + mistakes;
      const successRate = total > 0 ? Math.round((correct / total) * 100) : 0;
      
      const level = Math.floor(correct / 10) + 1;
      const nextLevel = level * 10;
      const progress = correct % 10;
      
      const rank = await redis.zrevrank(`counting:${guildId}:scores`, targetId);
      const rankDisplay = rank !== null ? `#${rank + 1}` : "Unranked";

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setAuthor({
          name: `${targetUser.username}'s Counting Stats`,
          iconURL: targetUser.displayAvatarURL()
        })
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { 
            name: "📊 Overall", 
            value: `✅ **${correct}** correct\n❌ **${mistakes}** mistakes\n📈 **${successRate}%** success rate`,
            inline: true 
          },
          { 
            name: "🔥 Streaks", 
            value: `⚡ Current: **${streak}**\n🏆 Record: **${record}**\n🛡️ Shields: **${shield}**`,
            inline: true 
          },
          { 
            name: "📈 Progress", 
            value: `🏅 Level: **${level}**\n🌟 Rank: **${rankDisplay}**\n📊 Progress: **${progress}/${nextLevel}**`,
            inline: true 
          }
        )
        .setFooter({ 
          text: `Total attempts: ${total} • ${targetUser.id === interaction.user.id ? "Your stats" : "Viewing stats"}`
        })
        .setTimestamp();

      if (progress > 0) {
        const barLength = 20;
        const filled = Math.floor((progress / nextLevel) * barLength);
        const bar = "█".repeat(filled) + "░".repeat(barLength - filled);
        embed.setDescription(`**Level Progress**\n\`${bar}\` ${Math.round((progress / nextLevel) * 100)}%`);
      }

      return interaction.editReply({ embeds: [embed] });
    }

    // =========================
    // 🏆 LEADERBOARD
    // =========================
    if (sub === "leaderboard") {
      const type = interaction.options.getString("type") || "correct";
      let data, title, description;

      if (type === "correct") {
        data = await redis.zrevrange(`counting:${guildId}:scores`, 0, 9, "WITHSCORES");
        title = "🏆 Most Correct Counts";
        description = "Top players with the most correct counts";
      } else if (type === "streak") {
        const keys = await redis.keys(`counting:${guildId}:*:highscore`);
        const streakData = [];
        for (const key of keys) {
          const id = key.split(":")[2];
          const streak = Number(await redis.get(key) || 0);
          streakData.push({ id, streak });
        }
        streakData.sort((a, b) => b.streak - a.streak);
        data = streakData.slice(0, 10);
        title = "🔥 Best Streaks";
        description = "Players with the longest counting streaks";
      } else {
        const keys = await redis.keys(`counting:${guildId}:*:daily`);
        const improvedData = [];
        for (const key of keys) {
          const id = key.split(":")[2];
          const daily = Number(await redis.get(key) || 0);
          improvedData.push({ id, daily });
        }
        improvedData.sort((a, b) => b.daily - a.daily);
        data = improvedData.slice(0, 10);
        title = "📈 Most Improved";
        description = "Players who gained the most counts today";
      }

      let text = "";
      if (!data || data.length === 0) {
        text = "No data available yet. Start counting!";
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
          
          text += `${medal} **${username}** — \`${value}\` ${type === 'correct' ? 'counts' : type === 'streak' ? 'streak' : 'today'}\n`;
        }
      }

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(title)
        .setDescription(text || "No players yet.")
        .setFooter({ text: description || "Counting leaderboard" })
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("counting_leaderboard_correct")
            .setLabel("🏆 Correct")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(type === "correct"),
          new ButtonBuilder()
            .setCustomId("counting_leaderboard_streak")
            .setLabel("🔥 Streak")
            .setStyle(ButtonStyle.Success)
            .setDisabled(type === "streak"),
          new ButtonBuilder()
            .setCustomId("counting_leaderboard_improved")
            .setLabel("📈 Improved")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(type === "improved")
        );

      return interaction.editReply({ 
        embeds: [embed],
        components: [row]
      });
    }

    // =========================
    // 🛒 SHOP
    // =========================
    if (sub === "shop") {
      const shieldPrice = 200;
      const doublePrice = 500;
      const resetPrice = 100;

      let coins = Number(await redis.get(`eco:${guildId}:${userId}:money`) || 0);
      const shield = Number(await redis.get(`eco:${guildId}:${userId}:shield`) || 0);
      const double = Number(await redis.get(`eco:${guildId}:${userId}:double`) || 0);
      const isDev = userId === "1303357369622990889";

      const embed = new EmbedBuilder()
        .setColor("#FF69B4")
        .setTitle("🛒 Counting Shop")
        .setDescription(`💰 Your balance: **${coins}** coins`)
        .addFields(
          { 
            name: "🛡️ Shield", 
            value: `Protects your streak from one mistake\nPrice: **${shieldPrice}** coins\nOwned: **${shield}**`,
            inline: true 
          },
          { 
            name: "⚡ Double XP", 
            value: `Double points for 5 correct counts\nPrice: **${doublePrice}** coins\nActive: **${double > 0 ? '✅ Yes' : '❌ No'}**`,
            inline: true 
          },
          { 
            name: "🔄 Reset Protection", 
            value: `Prevents all stats reset\nPrice: **${resetPrice}** coins`,
            inline: true 
          }
        )
        .setFooter({ text: "Use /counting buy <item> to purchase" })
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("counting_buy_shield")
            .setLabel(`🛡️ Buy Shield (${shieldPrice} coins)`)
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("counting_buy_double")
            .setLabel(`⚡ Buy Double XP (${doublePrice} coins)`)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("counting_buy_reset")
            .setLabel(`🔄 Buy Reset Protection (${resetPrice} coins)`)
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.editReply({ 
        embeds: [embed],
        components: [row]
      });
    }

    // =========================
    // 🔄 RESET (Admin only)
    // =========================
    if (sub === "reset") {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("❌ You need **Administrator** permission to reset stats.")
          ]
        });
      }

      const target = interaction.options.getUser("target");
      
      if (target) {
        await redis.zrem(`counting:${guildId}:scores`, target.id);
        await redis.zrem(`counting:${guildId}:sabotages`, target.id);
        await redis.del(`counting:${guildId}:${target.id}:streak`);
        await redis.del(`counting:${guildId}:${target.id}:highscore`);
        
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("#57F287")
              .setDescription(`✅ Reset stats for **${target.username}**`)
          ]
        });
      }

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("⚠️ Reset All Stats")
        .setDescription("This will reset **ALL** counting stats in this server. Are you sure?")
        .setFooter({ text: "React with ✅ to confirm" });

      const msg = await interaction.editReply({
        embeds: [embed],
        fetchReply: true
      });

      await msg.react("✅");
      
      const filter = (reaction, user) => 
        reaction.emoji.name === "✅" && user.id === userId;
      
      try {
        const collected = await msg.awaitReactions({ 
          filter, 
          max: 1, 
          time: 30000 
        });
        
        if (collected.size > 0) {
          const keys = await redis.keys(`counting:${guildId}:*`);
          for (const key of keys) {
            await redis.del(key);
          }
          
          // Reset count
          await redis.set(`count:${guildId}`, 0);
          
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor("#57F287")
                .setDescription("✅ All counting stats have been reset.")
            ],
            components: []
          });
        }
      } catch {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("❌ Reset cancelled.")
          ],
          components: []
        });
      }
    }
  }
};

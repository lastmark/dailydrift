// commands/counting.js - COMPLETE REWRITE
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require("discord.js");

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("counting")
    .setDescription("Counting game system")
    .addSubcommand(sub =>
      sub.setName("setup")
        .setDescription("Setup counting channel")
        .addChannelOption(opt =>
          opt.setName("channel")
            .setDescription("Channel for counting")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub.setName("stats")
        .setDescription("View your counting stats")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User to view stats for")
        )
    )
    .addSubcommand(sub =>
      sub.setName("leaderboard")
        .setDescription("View top counters")
    )
    .addSubcommand(sub =>
      sub.setName("reset")
        .setDescription("Reset counting stats (Admin only)")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("Reset specific user")
        )
    ),

  async execute(interaction, client, redis) {
    try {
      // Check if in server
      if (!interaction.inGuild()) {
        return interaction.reply({
          content: "❌ This command must be used in a server.",
          flags: MessageFlags.Ephemeral
        });
      }

      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const sub = interaction.options.getSubcommand();

      // =========================
      // ⚙️ SETUP
      // =========================
      if (sub === "setup") {
        // Check admin
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({
            content: "❌ You need Administrator permission.",
            flags: MessageFlags.Ephemeral
          });
        }

        const channel = interaction.options.getChannel("channel");
        
        // Save channel to Redis
        await redis.set(`counting:${guildId}:channel`, channel.id);
        
        // Initialize count if not exists
        if (!await redis.get(`counting:${guildId}:number`)) {
          await redis.set(`counting:${guildId}:number`, 0);
        }

        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle("✅ Counting System Setup Complete!")
          .setDescription(`Counting channel: ${channel}`)
          .addFields(
            { name: "Channel", value: `${channel}`, inline: true },
            { name: "Current Number", value: `0`, inline: true }
          )
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      // =========================
      // 📊 STATS
      // =========================
      if (sub === "stats") {
        const targetUser = interaction.options.getUser("user") || interaction.user;
        const targetId = targetUser.id;

        const correct = Number(await redis.zscore(`counting:${guildId}:correct`, targetId) || 0);
        const mistakes = Number(await redis.zscore(`counting:${guildId}:mistakes`, targetId) || 0);
        const streak = Number(await redis.get(`counting:${guildId}:${targetId}:streak`) || 0);
        const bestStreak = Number(await redis.get(`counting:${guildId}:${targetId}:bestStreak`) || 0);
        
        const total = correct + mistakes;
        const successRate = total > 0 ? Math.round((correct / total) * 100) : 0;

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
              value: `⚡ Current: **${streak}**\n🏆 Best: **${bestStreak}**`,
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
        const data = await redis.zrevrange(`counting:${guildId}:correct`, 0, 9, "WITHSCORES");
        
        let description = "";
        if (!data || data.length === 0) {
          description = "No one has counted yet!";
        } else {
          const medals = ["🥇", "🥈", "🥉"];
          for (let i = 0; i < data.length; i += 2) {
            const rank = (i / 2) + 1;
            const id = data[i];
            const score = data[i + 1];
            const medal = rank <= 3 ? medals[rank - 1] : `#${rank}`;
            
            try {
              const user = await client.users.fetch(id);
              description += `${medal} **${user.username}** — \`${score}\` counts\n`;
            } catch {
              description += `${medal} **Unknown User** — \`${score}\` counts\n`;
            }
          }
        }

        const embed = new EmbedBuilder()
          .setColor("#FFD700")
          .setTitle("🏆 Counting Leaderboard")
          .setDescription(description)
          .setFooter({ text: "Top 10 counters" })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      // =========================
      // 🔄 RESET (Admin only)
      // =========================
      if (sub === "reset") {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({
            content: "❌ You need Administrator permission.",
            flags: MessageFlags.Ephemeral
          });
        }

        const targetUser = interaction.options.getUser("user");
        
        if (targetUser) {
          // Reset specific user
          await redis.zrem(`counting:${guildId}:correct`, targetUser.id);
          await redis.zrem(`counting:${guildId}:mistakes`, targetUser.id);
          await redis.del(`counting:${guildId}:${targetUser.id}:streak`);
          await redis.del(`counting:${guildId}:${targetUser.id}:bestStreak`);
          
          return interaction.reply({
            content: `✅ Reset stats for **${targetUser.username}**`,
            flags: MessageFlags.Ephemeral
          });
        }

        // Reset all stats (with confirmation)
        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("⚠️ Reset All Stats")
          .setDescription("This will reset ALL counting stats in this server. React with ✅ to confirm.");

        await interaction.reply({ embeds: [embed], withResponse: true });
        const msg = await interaction.fetchReply();
        await msg.react("✅");
        
        try {
          const collected = await msg.awaitReactions({
            filter: (reaction, user) => reaction.emoji.name === "✅" && user.id === userId,
            max: 1,
            time: 30000
          });
          
          if (collected.size > 0) {
            // Reset all counting data
            const keys = await redis.keys(`counting:${guildId}:*`);
            for (const key of keys) {
              await redis.del(key);
            }
            await redis.set(`counting:${guildId}:number`, 0);
            
            return interaction.editReply({
              content: "✅ All counting stats have been reset.",
              embeds: [],
              components: []
            });
          } else {
            return interaction.editReply({
              content: "❌ Reset cancelled.",
              embeds: [],
              components: []
            });
          }
        } catch (error) {
          return interaction.editReply({
            content: "❌ Reset cancelled or timed out.",
            embeds: [],
            components: []
          });
        }
      }

    } catch (error) {
      console.error("Counting command error:", error);
      return interaction.reply({
        content: `❌ Error: ${error.message}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

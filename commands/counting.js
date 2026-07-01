// commands/counting.js - Complete Counting Engine (Custom Database Adaptation)
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require("discord.js");

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("counting")
    .setDescription("Counting game system infrastructure")
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

  async execute(interaction, client, db) {
    try {
      if (!interaction.inGuild()) {
        return interaction.reply({
          content: "❌ Operation Denied: This command must be executed within a guild matrix.",
          flags: MessageFlags.Ephemeral
        });
      }

      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const sub = interaction.options.getSubcommand();

      // Helper to fetch consolidated guild userdata object
      const getUserDataStore = async () => {
        return await db.get(`counting:${guildId}:userdata`) || {};
      };

      // =========================
      // ⚙️ SETUP
      // =========================
      if (sub === "setup") {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({
            content: "❌ Administrative authority failure: Requires `Administrator` permission flags.",
            flags: MessageFlags.Ephemeral
          });
        }

        const channel = interaction.options.getChannel("channel");
        
        await db.set(`counting:${guildId}:channel`, channel.id);
        
        const currentNum = await db.get(`counting:${guildId}:number`);
        if (currentNum === null || currentNum === undefined) {
          await db.set(`counting:${guildId}:number`, 0);
        }

        const embed = new EmbedBuilder()
          .setColor("#0A0A0A")
          .setTitle("⚙️ Counting Matrix Initialized")
          .setDescription(`The counting system interface has targeted a new text sector.`)
          .addFields(
            { name: "📡 Terminal Channel", value: `${channel}`, inline: true },
            { name: "🔢 Starting Value", value: `\`${currentNum || 0}\``, inline: true }
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

        const userDataStore = await getUserDataStore();
        const profile = userDataStore[targetId] || { correct: 0, mistakes: 0, streak: 0, bestStreak: 0 };

        const correct = Number(profile.correct || 0);
        const mistakes = Number(profile.mistakes || 0);
        const streak = Number(profile.streak || 0);
        const bestStreak = Number(profile.bestStreak || 0);
        
        const total = correct + mistakes;
        const successRate = total > 0 ? Math.round((correct / total) * 100) : 0;

        const embed = new EmbedBuilder()
          .setColor("#0A0A0A")
          .setAuthor({
            name: `${targetUser.username}'s Matrix Metrics`,
            iconURL: targetUser.displayAvatarURL({ dynamic: true })
          })
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .addFields(
            { 
              name: "📊 Precision Logs", 
              value: `🟢 Correct: \`${correct}\`\n🔴 Mistakes: \`${mistakes}\`\n📈 Rate: \`${successRate}%\``,
              inline: true 
            },
            { 
              name: "🔥 Activity Waves", 
              value: `⚡ Current Streak: \`${streak}\`\n🏆 Max Overload: \`${bestStreak}\``,
              inline: true 
            }
          )
          .setFooter({ text: `Total processing lines: ${total}` })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      // =========================
      // 🏆 LEADERBOARD
      // =========================
      if (sub === "leaderboard") {
        const userDataStore = await getUserDataStore();
        
        // Transform user dictionary array map into dynamic sorting layouts
        const sorted = Object.entries(userDataStore)
          .map(([id, data]) => ({ id, correct: data.correct || 0 }))
          .filter(u => u.correct > 0)
          .sort((a, b) => b.correct - a.correct)
          .slice(0, 10);
        
        let description = "";
        if (!sorted.length) {
          description = "*No active network nodes logged inside database tracks.*";
        } else {
          sorted.forEach((node, index) => {
            const rankSymbol = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `\`#${index + 1}\``;
            description += `${rankSymbol} <@${node.id}> ➔ \`${node.correct}\` processed strings\n`;
          });
        }

        const embed = new EmbedBuilder()
          .setColor("#0A0A0A")
          .setTitle("🏆 Top Node Counters")
          .setDescription(description)
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      // =========================
      // 🔄 RESET (Admin only)
      // =========================
      if (sub === "reset") {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({
            content: "❌ Administrative authority failure: Requires `Administrator` permission flags.",
            flags: MessageFlags.Ephemeral
          });
        }

        const targetUser = interaction.options.getUser("user");
        const userDataStore = await getUserDataStore();
        
        if (targetUser) {
          // Erase singular node block cleanly from local store mapping
          if (userDataStore[targetUser.id]) {
            delete userDataStore[targetUser.id];
            await db.set(`counting:${guildId}:userdata`, userDataStore);
          }
          
          return interaction.reply({
            content: `🟢 **Sector Repaired:** Data tracks cleared for user **${targetUser.username}**.`,
            flags: MessageFlags.Ephemeral
          });
        }

        // Full server block wipeout sequence
        const embed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setTitle("⚠️ Warning: Destructive Action Formed")
          .setDescription("This execution will completely wipe out ALL registry profiles mapped under this guild instance. React with ✅ to confirm.");

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
            // Drop entire guild mapping fields cleanly via explicit del commands
            await db.del(`counting:${guildId}:userdata`);
            await db.set(`counting:${guildId}:number`, 0);
            await db.set(`counting:${guildId}:lastUser`, "");
            
            return interaction.editReply({
              content: "🟢 **System Flash Completed:** Data sectors wiped. Counter value rolled back to `0`.",
              embeds: [],
              components: []
            });
          } else {
            return interaction.editReply({
              content: "❌ Sequence aborted: Confirmation timeframe expired.",
              embeds: [],
              components: []
            });
          }
        } catch (error) {
          return interaction.editReply({
            content: "❌ Sequence aborted: Internal check failure or timeout.",
            embeds: [],
            components: []
          });
        }
      }

    } catch (error) {
      console.error("Counting command error:", error);
      return interaction.reply({
        content: `❌ Critical system error encountered: ${error.message}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

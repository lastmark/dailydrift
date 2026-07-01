// commands/balance.js – Cleaner, with coin trading warning
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { formatNumber } = require("../utils.js");

module.exports = {
  category: "Economy",
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check or send coins")
    .addSubcommand(sub =>
      sub.setName("view")
        .setDescription("View your balance or another user's")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User to view")
        )
    )
    .addSubcommand(sub =>
      sub.setName("send")
        .setDescription("Send coins to another user (max 200,000/day)")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("Recipient")
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName("amount")
            .setDescription("Amount to send")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000000)
        )
    ),

  async execute(interaction, client, db) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // =========================
    // 👁️ VIEW subcommand
    // =========================
    if (sub === "view") {
      const target = interaction.options.getUser("user") || interaction.user;
      const targetId = target.id;

      const balance = Number(await db.get(`eco:${targetId}:money`) || 0);
      const shield = Number(await db.get(`eco:${targetId}:shield`) || 0);

      let dailyRemaining = null;
      if (targetId === userId) {
        const today = new Date().toISOString().slice(0, 10);
        const dailyKey = `eco:send:${userId}:${today}`;
        const sentToday = Number(await db.get(dailyKey) || 0);
        const DAILY_LIMIT = 200000;
        dailyRemaining = DAILY_LIMIT - sentToday;
      }

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist styling
        .setAuthor({
          name: `${target.username}'s Vault`,
          iconURL: target.displayAvatarURL({ dynamic: true })
        })
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(
          { 
            name: "💰 Coins Balance", 
            value: `\`${formatNumber(balance)}\``, 
            inline: true 
          },
          { 
            name: "🛡️ Active Shields", 
            value: `\`${formatNumber(shield)}\``, 
            inline: true 
          }
        )
        .setTimestamp();

      if (dailyRemaining !== null) {
        embed.addFields({
          name: "📤 Daily Transaction limit",
          value: `\`${formatNumber(Math.max(0, dailyRemaining))}\` / 200,000 remaining`,
          inline: false
        });
      }

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 💸 SEND subcommand
    // =========================
    if (sub === "send") {
      const targetUser = interaction.options.getUser("user");
      const targetId = targetUser.id;
      const amount = interaction.options.getInteger("amount");

      if (targetId === userId) {
        return interaction.reply({
          content: "❌ You cannot send coins to yourself.",
          flags: MessageFlags.Ephemeral
        });
      }

      const senderBalance = Number(await db.get(`eco:${userId}:money`) || 0);
      if (senderBalance < amount) {
        return interaction.reply({
          content: `❌ Insufficient funds. Available balance: \`${formatNumber(senderBalance)}\``,
          flags: MessageFlags.Ephemeral
        });
      }

      // Daily limit tracking
      const today = new Date().toISOString().slice(0, 10);
      const dailyKey = `eco:send:${userId}:${today}`;
      let sentToday = Number(await db.get(dailyKey) || 0);
      const DAILY_LIMIT = 200000;

      if (sentToday + amount > DAILY_LIMIT) {
        const remaining = DAILY_LIMIT - sentToday;
        return interaction.reply({
          content: `❌ You have reached your daily transfer limit.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // ---- Public confirmation embed with warning ----
      const confirmEmbed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle("📤 Confirm Transfer")
        .setDescription(
          `<@${userId}> is transferring **${formatNumber(amount)}** coins to **${targetUser.username}**.`
        )
        .addFields(
          { name: "Sender Current", value: `\`${formatNumber(senderBalance)}\``, inline: true },
          { name: "Recipient", value: `${targetUser}`, inline: true },
          { name: "Post-Transaction", value: `\`${formatNumber(senderBalance - amount)}\``, inline: true }
        )
        .setFooter({ 
          text: "ℹ️ Coin trading for real money or transactions outside the network are prohibited." 
        })
        .setTimestamp();

      const msg = await interaction.reply({
        embeds: [confirmEmbed],
        withResponse: true
      });
      const replyMsg = msg.resource.message;

      await replyMsg.react('✅');
      await replyMsg.react('❌');

      const filter = (reaction, user) => {
        return ['✅', '❌'].includes(reaction.emoji.name) && user.id === userId;
      };

      try {
        const collected = await replyMsg.awaitReactions({
          filter,
          max: 1,
          time: 30000,
          errors: ['time']
        });

        const reaction = collected.first();

        if (reaction.emoji.name === '✅') {
          // Re-fetch parameters securely to prevent race conditions during reaction wait time
          const freshSenderBal = Number(await db.get(`eco:${userId}:money`) || 0);
          const freshTargetBal = Number(await db.get(`eco:${targetId}:money`) || 0);
          const freshSentToday = Number(await db.get(dailyKey) || 0);

          if (freshSenderBal < amount) {
            await replyMsg.reactions.removeAll().catch(() => {});
            return replyMsg.edit({ content: "❌ Transaction failed during verification. Any balance changes have been reverted.", embeds: [] });
          }

          // Process MongoDB transfers safely
          await db.set(`eco:${userId}:money`, freshSenderBal - amount);
          await db.set(`eco:${targetId}:money`, freshTargetBal + amount);
          await db.set(dailyKey, freshSentToday + amount);

          // Custom execution block expiration mirror via setTimeout loop simulation
          setTimeout(async () => {
            await db.del(dailyKey).catch(() => {});
          }, 86400 * 1000);

          const successEmbed = new EmbedBuilder()
            .setColor("#22C55E")
            .setTitle("✅ Transfer Completed")
            .setDescription(`<@${userId}> safely transferred **${formatNumber(amount)}** coins to **${targetUser.username}**.`)
            .addFields(
              { name: "Updated Balance", value: `\`${formatNumber(freshSenderBal - amount)}\``, inline: true },
              { name: "Remaining Daily Allowance", value: `\`${formatNumber(DAILY_LIMIT - (freshSentToday + amount))}\``, inline: true }
            )
            .setFooter({ 
              text: "ℹ️ Coin trading for real money or transactions outside the network are prohibited." 
            })
            .setTimestamp();

          await replyMsg.edit({ embeds: [successEmbed] });
          await replyMsg.reactions.removeAll().catch(() => {});
          return;

        } else if (reaction.emoji.name === '❌') {
          const cancelEmbed = new EmbedBuilder()
            .setColor("#BA1A1A")
            .setTitle("❌ Transfer Cancelled ")
            .setDescription(`<@${userId}> ❌ Transaction Cancelled
The transfer was cancelled by the sender..`)
            .setTimestamp();

          await replyMsg.edit({ embeds: [cancelEmbed] });
          await replyMsg.reactions.removeAll().catch(() => {});
          return;
        }

      } catch (error) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setTitle("⌛ Verification Expired")
          .setDescription(`<@${userId}> ❌ Transaction cancelled. Confirmation timed out after 30 seconds..`)
          .setTimestamp();

        await replyMsg.edit({ embeds: [timeoutEmbed] });
        await replyMsg.reactions.removeAll().catch(() => {});
        return;
      }
    }
  }
};

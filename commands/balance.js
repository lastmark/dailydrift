// commands/balance.js – Full with send subcommand and daily limit
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
            .setMaxValue(1000000) // safety cap
        )
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // =========================
    // 📊 VIEW
    // =========================
    if (sub === "view" || !sub) {
      const target = interaction.options.getUser("user") || interaction.user;
      const targetId = target.id;

      const balance = Number(await redis.get(`eco:${targetId}:money`) || 0);
      const shield = Number(await redis.get(`eco:${targetId}:shield`) || 0);
      const totalEarned = Number(await redis.get(`eco:${targetId}:total_earned`) || 0);
      const totalSpent = Number(await redis.get(`eco:${targetId}:total_spent`) || 0);

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`${target.username}'s Wallet`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "💰 Coins", value: `\`${formatNumber(balance)}\``, inline: true },
          { name: "🛡️ Shields", value: `\`${formatNumber(shield)}\``, inline: true },
          { name: "📈 Total Earned", value: `\`${formatNumber(totalEarned)}\``, inline: true },
          { name: "💸 Total Spent", value: `\`${formatNumber(totalSpent)}\``, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // =========================
    // 💸 SEND
    // =========================
    if (sub === "send") {
      const targetUser = interaction.options.getUser("user");
      const targetId = targetUser.id;
      const amount = interaction.options.getInteger("amount");

      // Prevent sending to yourself
      if (targetId === userId) {
        return interaction.reply({
          content: "❌ You cannot send coins to yourself.",
          flags: MessageFlags.Ephemeral
        });
      }

      // Check sender's balance
      const senderBalance = Number(await redis.get(`eco:${userId}:money`) || 0);
      if (senderBalance < amount) {
        return interaction.reply({
          content: `❌ You don't have enough coins. You have ${formatNumber(senderBalance)}.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Check daily limit
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const dailyKey = `eco:send:${userId}:${today}`;
      let sentToday = Number(await redis.get(dailyKey) || 0);

      // Reset if new day (optional, we can use TTL)
      // But we set TTL to 24h and key is date-based, so it resets automatically.
      // We'll just check.
      const DAILY_LIMIT = 200000;
      if (sentToday + amount > DAILY_LIMIT) {
        const remaining = DAILY_LIMIT - sentToday;
        return interaction.reply({
          content: `❌ You've reached your daily sending limit (${formatNumber(DAILY_LIMIT)} coins/day). You can only send ${formatNumber(remaining)} more today.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // ---- Confirmation embed ----
      const confirmEmbed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle("📤 Confirm Transaction")
        .setDescription(`You are about to send **${formatNumber(amount)}** coins to **${targetUser.username}**.`)
        .addFields(
          { name: "Your Balance", value: `${formatNumber(senderBalance)}`, inline: true },
          { name: "Recipient", value: `${targetUser}`, inline: true },
          { name: "New Balance (after send)", value: `${formatNumber(senderBalance - amount)}`, inline: true }
        )
        .setFooter({ text: "React with ✅ to confirm, ❌ to cancel. (30 seconds)" })
        .setTimestamp();

      const msg = await interaction.reply({
        embeds: [confirmEmbed],
        withResponse: true
      });
      const replyMsg = msg.resource.message;

      await replyMsg.react('✅');
      await replyMsg.react('❌');

      // Collector for reactions
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
          // ---- Execute transfer ----
          // Deduct from sender
          await redis.decrby(`eco:${userId}:money`, amount);
          // Add to recipient
          await redis.incrby(`eco:${targetId}:money`, amount);
          // Update total spent/earned
          await redis.incrby(`eco:${userId}:total_spent`, amount);
          await redis.incrby(`eco:${targetId}:total_earned`, amount);
          // Update daily sent
          await redis.incrby(dailyKey, amount);
          // Set TTL for 24h (to auto-reset)
          await redis.expire(dailyKey, 86400);

          const newBalance = await redis.get(`eco:${userId}:money`) || 0;

          const successEmbed = new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("✅ Transfer Complete!")
            .setDescription(`You sent **${formatNumber(amount)}** coins to **${targetUser.username}**.`)
            .addFields(
              { name: "New Balance", value: `${formatNumber(newBalance)}`, inline: true },
              { name: "Today's Remaining Limit", value: `${formatNumber(DAILY_LIMIT - (sentToday + amount))}`, inline: true }
            )
            .setTimestamp();

          await replyMsg.edit({ embeds: [successEmbed] });
          await replyMsg.reactions.removeAll().catch(() => {});
          return;

        } else if (reaction.emoji.name === '❌') {
          const cancelEmbed = new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle("❌ Transfer Cancelled")
            .setDescription("You cancelled the transaction.")
            .setTimestamp();

          await replyMsg.edit({ embeds: [cancelEmbed] });
          await replyMsg.reactions.removeAll().catch(() => {});
          return;
        }

      } catch (error) {
        // Timeout
        const timeoutEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("⌛ Timed Out")
          .setDescription("You didn't confirm in time. Transfer cancelled.")
          .setTimestamp();

        await replyMsg.edit({ embeds: [timeoutEmbed] });
        await replyMsg.reactions.removeAll().catch(() => {});
        return;
      }
    }
  }
};

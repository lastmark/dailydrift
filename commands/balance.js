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

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // =========================
    // 👁️ VIEW
    // =========================
    if (sub === "view") {
      const target = interaction.options.getUser("user") || interaction.user;
      const targetId = target.id;

      const balance = Number(await redis.get(`eco:${targetId}:money`) || 0);
      const shield = Number(await redis.get(`eco:${targetId}:shield`) || 0);

      let dailyRemaining = null;
      if (targetId === userId) {
        const today = new Date().toISOString().slice(0, 10);
        const dailyKey = `eco:send:${userId}:${today}`;
        const sentToday = Number(await redis.get(dailyKey) || 0);
        const DAILY_LIMIT = 200000;
        dailyRemaining = DAILY_LIMIT - sentToday;
      }

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setAuthor({
          name: `${target.username}'s Wallet`,
          iconURL: target.displayAvatarURL()
        })
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { 
            name: "💰 Coins", 
            value: `\`${formatNumber(balance)}\``, 
            inline: true 
          },
          { 
            name: "🛡️ Shields", 
            value: `\`${formatNumber(shield)}\``, 
            inline: true 
          }
        )
        .setTimestamp();

      if (dailyRemaining !== null) {
        embed.addFields({
          name: "📤 Daily Send Limit",
          value: `\`${formatNumber(Math.max(0, dailyRemaining))}\` / 200,000 remaining`,
          inline: false
        });
      }

      return interaction.reply({ embeds: [embed] });
    }

    // =========================
    // 💸 SEND
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

      const senderBalance = Number(await redis.get(`eco:${userId}:money`) || 0);
      if (senderBalance < amount) {
        return interaction.reply({
          content: `❌ You don't have enough coins. You have ${formatNumber(senderBalance)}.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Daily limit
      const today = new Date().toISOString().slice(0, 10);
      const dailyKey = `eco:send:${userId}:${today}`;
      let sentToday = Number(await redis.get(dailyKey) || 0);
      const DAILY_LIMIT = 200000;

      if (sentToday + amount > DAILY_LIMIT) {
        const remaining = DAILY_LIMIT - sentToday;
        return interaction.reply({
          content: `❌ You've reached your daily sending limit (${formatNumber(DAILY_LIMIT)} coins/day). You can only send ${formatNumber(remaining)} more today.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // ---- Public confirmation embed with warning ----
      const confirmEmbed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle("📤 Confirm Transaction")
        .setDescription(
          `<@${userId}> is about to send **${formatNumber(amount)}** coins to **${targetUser.username}**.`
        )
        .addFields(
          { name: "Sender Balance", value: `${formatNumber(senderBalance)}`, inline: true },
          { name: "Recipient", value: `${targetUser}`, inline: true },
          { name: "New Balance (after send)", value: `${formatNumber(senderBalance - amount)}`, inline: true }
        )
        .setFooter({ 
          text: "ℹ️ Important Notice: Coin trading (buying or selling coins for real money or outside the bot) is strictly prohibited. Use coins only inside the bot system to avoid penalties." 
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
          // Transfer
          await redis.decrby(`eco:${userId}:money`, amount);
          await redis.incrby(`eco:${targetId}:money`, amount);
          await redis.incrby(dailyKey, amount);
          await redis.expire(dailyKey, 86400);

          const newBalance = await redis.get(`eco:${userId}:money`) || 0;

          const successEmbed = new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("✅ Transfer Complete!")
            .setDescription(`<@${userId}> sent **${formatNumber(amount)}** coins to **${targetUser.username}**.`)
            .addFields(
              { name: "New Balance", value: `${formatNumber(newBalance)}`, inline: true },
              { name: "Today's Remaining Limit", value: `${formatNumber(DAILY_LIMIT - (sentToday + amount))}`, inline: true }
            )
            .setFooter({ 
              text: "ℹ️ Important Notice: Coin trading (buying or selling coins for real money or outside the bot) is strictly prohibited. Use coins only inside the bot system to avoid penalties." 
            })
            .setTimestamp();

          await replyMsg.edit({ embeds: [successEmbed] });
          await replyMsg.reactions.removeAll().catch(() => {});
          return;

        } else if (reaction.emoji.name === '❌') {
          const cancelEmbed = new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle("❌ Transfer Cancelled")
            .setDescription(`<@${userId}> cancelled the transaction.`)
            .setTimestamp();

          await replyMsg.edit({ embeds: [cancelEmbed] });
          await replyMsg.reactions.removeAll().catch(() => {});
          return;
        }

      } catch (error) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("⌛ Timed Out")
          .setDescription(`<@${userId}> didn't confirm in time. Transfer cancelled.`)
          .setTimestamp();

        await replyMsg.edit({ embeds: [timeoutEmbed] });
        await replyMsg.reactions.removeAll().catch(() => {});
        return;
      }
    }
  }
};

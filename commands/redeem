// commands/redeem.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("redeem")
    .setDescription("Redeem a premium code")
    .addStringOption(o =>
      o.setName("code")
        .setDescription("The code to redeem")
        .setRequired(true)
    ),

  async execute(interaction, client, redis) {
    const code = interaction.options.getString("code").toUpperCase();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
      // Get code data
      const data = await redis.get(`redeem:${code}`);
      if (!data) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("❌ Invalid or expired code.")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const redeemData = JSON.parse(data);

      // Check if code has expired
      if (redeemData.seconds !== -1) {
        const expiresAt = redeemData.createdAt + (redeemData.seconds * 1000);
        if (Date.now() > expiresAt) {
          await redis.del(`redeem:${code}`);
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor("#ED4245")
                .setDescription("❌ This code has expired.")
            ],
            flags: MessageFlags.Ephemeral
          });
        }
      }

      // Check if user already used this code
      if (redeemData.users.includes(userId)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("❌ You have already used this code.")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      // Check if code has remaining uses
      if (redeemData.uses <= redeemData.used) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("❌ This code has been fully used.")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      // Process redemption
      const updates = [];

      // Give premium
      if (redeemData.isPremium) {
        await redis.set(`eco:${userId}:vip`, "true");
        updates.push("👑 Premium Access");
      }

      // Give coins
      if (redeemData.coins > 0) {
        await redis.incrby(`eco:${userId}:money`, redeemData.coins);
        updates.push(`💰 ${redeemData.coins} Coins`);
      }

      // Update code usage
      redeemData.used += 1;
      redeemData.users.push(userId);
      await redis.set(`redeem:${code}`, JSON.stringify(redeemData));

      // If fully used, remove from set
      if (redeemData.used >= redeemData.uses) {
        await redis.srem(`redeem:all_codes`, code);
      }

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ Code Redeemed Successfully!")
        .setDescription(`You redeemed code **${code}**`)
        .addFields(
          {
            name: "🎁 Rewards Received",
            value: updates.join("\n") || "No rewards configured",
            inline: false
          },
          {
            name: "📊 Remaining Uses",
            value: `**${redeemData.uses - redeemData.used}** / ${redeemData.uses}`,
            inline: true
          }
        )
        .setFooter({ text: "Thanks for using our premium codes!" })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error("Error redeeming code:", error);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#ED4245")
            .setDescription("❌ An error occurred while redeeming the code.")
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

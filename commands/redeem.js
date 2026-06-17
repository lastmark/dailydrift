// commands/redeem.js – FIXED to work with generatecode.js
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
      const raw = await redis.get(`redeem:${code}`);
      if (!raw) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("❌ Invalid or expired code.")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const data = JSON.parse(raw);

      // --- Validation ---
      if (data.uses <= 0) {
        await redis.del(`redeem:${code}`);
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("❌ This code has been fully used.")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      if (data.seconds !== -1 && (Date.now() - data.createdAt) > data.seconds * 1000) {
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

      if (data.users && data.users.includes(userId)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("❌ You have already used this code.")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      // --- Determine premium type ---
      const premiumType = data.type || 'user'; // fallback to user
      const premiumKey = premiumType === 'guild'
        ? `premium:guild:${guildId}`
        : `premium:user:${userId}`;

      // --- Set premium with TTL ---
      let ttlUsed = -1;
      if (data.duration === "perm") {
        await redis.set(premiumKey, "perm");
      } else {
        const ttl = (data.seconds && data.seconds > 0) ? data.seconds : 3600; // default 1h
        ttlUsed = ttl;
        await redis.set(premiumKey, "active", "EX", ttl);
      }

      // --- Give coins if enabled ---
      const updates = [];
      if (data.giveCoins && data.coinAmount > 0) {
        await redis.incrby(`eco:${userId}:money`, data.coinAmount);
        updates.push(`💰 ${data.coinAmount} coins`);
      }

      // --- Update code usage ---
      data.used = (data.used || 0) + 1;
      if (!data.users) data.users = [];
      data.users.push(userId);

      if (data.used >= data.uses) {
        await redis.del(`redeem:${code}`);
      } else {
        await redis.set(`redeem:${code}`, JSON.stringify(data));
      }

      // --- Build response ---
      const premiumDisplay = premiumType === 'guild' ? '🏢 Guild' : '👤 User';
      const durationDisplay = data.duration === "perm" ? "♾️ Lifetime" : data.duration;

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ Code Redeemed Successfully!")
        .setDescription(`You redeemed **${code}** for **${premiumDisplay} Premium**.`)
        .addFields(
          {
            name: "🎁 Rewards",
            value: updates.length ? updates.join("\n") : "None",
            inline: false
          },
          {
            name: "⏳ Duration",
            value: durationDisplay,
            inline: true
          },
          {
            name: "📊 Remaining Uses",
            value: `${data.uses - data.used} / ${data.uses}`,
            inline: true
          }
        )
        .setFooter({ text: "Your premium is now active!" })
        .setTimestamp();

      // Debug field for dev (optional)
      if (interaction.user.id === "1303357369622990889") {
        embed.addFields({
          name: "🔧 Debug (DEV only)",
          value: `Key: \`${premiumKey}\`\nTTL: ${ttlUsed}s`,
          inline: false
        });
      }

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error("Redeem error:", error);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#ED4245")
            .setDescription(`❌ An error occurred: ${error.message}`)
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

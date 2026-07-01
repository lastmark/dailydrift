// commands/redeem.js – Fixed MongoDB redemption
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  category: "Premium",
  data: new SlashCommandBuilder()
    .setName("redeem")
    .setDescription("Claim a premium subscription activation code")
    .addStringOption(o =>
      o.setName("code")
        .setDescription("The unique activation hash")
        .setRequired(true)
    ),

  async execute(interaction, client, db) {
    const code = interaction.options.getString("code").toUpperCase();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
      // 1️⃣ Fetch raw data (stored as JSON string)
      const raw = await db.get(`redeem:${code}`);
      if (!raw) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("❌ Invalid or already redeemed code.")],
          flags: MessageFlags.Ephemeral
        });
      }

      // 2️⃣ Parse the JSON string into an object
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        console.error("Redeem code JSON parse error:", e);
        await db.del(`redeem:${code}`);
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("❌ Corrupted code – removed.")],
          flags: MessageFlags.Ephemeral
        });
      }

      // 3️⃣ Validation
      if (data.used >= data.uses) {
        await db.del(`redeem:${code}`);
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("❌ This code has already been fully redeemed.")],
          flags: MessageFlags.Ephemeral
        });
      }

      if (data.users && data.users.includes(userId)) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("❌ You have already used this code.")],
          flags: MessageFlags.Ephemeral
        });
      }

      // 4️⃣ Apply premium
      const premiumType = data.type || 'user';
      const premiumKey = premiumType === 'guild'
        ? `premium:guild:${guildId}`
        : `premium:user:${userId}`;

      if (data.duration === "perm") {
        await db.set(premiumKey, "perm");
      } else {
        const seconds = data.seconds || 3600;
        await db.set(premiumKey, "active");
        await db.expire(premiumKey, seconds);
      }

      // 5️⃣ Give coins if applicable
      let coinsMsg = "";
      if (data.giveCoins && data.coinAmount > 0) {
        const currentBal = Number(await db.get(`eco:${userId}:money`) || 0);
        await db.set(`eco:${userId}:money`, currentBal + data.coinAmount);
        coinsMsg = `💰 +${data.coinAmount.toLocaleString()} coins`;
      }

      // 6️⃣ Update code usage
      data.used += 1;
      if (!data.users) data.users = [];
      data.users.push(userId);

      // Store back as JSON string
      await db.set(`redeem:${code}`, JSON.stringify(data));

      // 7️⃣ Build response
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ Code Redeemed!")
        .setDescription(`You activated **${premiumType.toUpperCase()} PREMIUM**.`)
        .addFields(
          { name: "⏳ Duration", value: data.duration === "perm" ? "♾️ Lifetime" : `\`${data.duration}\``, inline: true },
          { name: "📊 Uses", value: `${data.used} / ${data.uses}`, inline: true }
        );
      if (coinsMsg) embed.addFields({ name: "🎁 Bonus", value: coinsMsg, inline: false });

      embed.setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } catch (error) {
      console.error("Redemption error:", error);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("❌ Internal error during redemption.")],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

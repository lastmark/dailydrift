// commands/redeem.js – Premium Code Redemption Engine (MongoDB Optimized)
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
      // Fetch code data from MongoDB
      const data = await db.get(`redeem:${code}`);
      
      if (!data) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#BA1A1A").setDescription("❌ **Invalid Registry:** The provided code is unrecognized or has been exhausted.")],
          flags: MessageFlags.Ephemeral
        });
      }

      // --- Validation ---
      if (data.used >= data.uses) {
        await db.del(`redeem:${code}`);
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#BA1A1A").setDescription("❌ **Exhausted:** This code has reached its maximum redemption threshold.")],
          flags: MessageFlags.Ephemeral
        });
      }

      // Check if user already redeemed
      if (data.users && data.users.includes(userId)) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor("#BA1A1A").setDescription("❌ **Redundancy Detected:** You have already utilized this specific code.")],
          flags: MessageFlags.Ephemeral
        });
      }

      // --- Determine premium type and expiry ---
      const premiumType = data.type || 'user';
      const premiumKey = premiumType === 'guild' ? `premium:guild:${guildId}` : `premium:user:${userId}`;
      
      const now = Date.now();
      let newExpiry;

      if (data.duration === "perm") {
        newExpiry = -1;
      } else {
        // Calculate expiry based on duration (seconds)
        const durationMs = (data.seconds || 3600) * 1000;
        newExpiry = now + durationMs;
      }

      // Save to MongoDB (Updating the subscription record)
      await db.set(premiumKey, { expiry: newExpiry });

      // --- Give currency rewards if applicable ---
      const updates = [];
      if (data.giveCoins && data.coinAmount > 0) {
        const currentBal = Number(await db.get(`eco:${userId}:money`) || 0);
        await db.set(`eco:${userId}:money`, currentBal + data.coinAmount);
        updates.push(`💰 \`${data.coinAmount.toLocaleString()}\` coins credited`);
      }

      // --- Update code usage registry ---
      data.used += 1;
      data.users.push(userId);
      await db.set(`redeem:${code}`, data);

      // --- Build response ---
      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist styling
        .setTitle("✅ Authorization Successful")
        .setDescription(`Redemption sequence validated for **${premiumType.toUpperCase()} PREMIUM** profile.`)
        .addFields(
          { name: "🎁 Allocation Rewards", value: updates.length ? updates.join("\n") : "None", inline: false },
          { name: "⏳ Term Duration", value: data.duration === "perm" ? "♾️ Lifetime" : `\`${data.duration}\``, inline: true },
          { name: "📊 Usage Status", value: `\`${data.used} / ${data.uses}\``, inline: true }
        )
        .setFooter({ text: "Subscription status updated in the database." })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } catch (error) {
      console.error("Redemption pipeline error:", error);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor("#BA1A1A").setDescription("❌ **System Fault:** Critical failure during redemption verification.")],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

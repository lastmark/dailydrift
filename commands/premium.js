// commands/premium.js – FINAL FIXED
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags
} = require("discord.js");

const DEV_ID = "1303357369622990889";

function formatTTL(ttl) {
  if (ttl === -1) return "♾️ Lifetime";
  if (ttl <= 0) return "❌ Expired";
  const d = Math.floor(ttl / 86400);
  const h = Math.floor((ttl % 86400) / 3600);
  const m = Math.floor((ttl % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.length > 0 ? `⏳ ${parts.join(' ')}` : "⏳ < 1 minute";
}

module.exports = {
  category: "Premium",

  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("💎 Premium Dashboard"),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // Fetch premium data
    let userValue = await redis.get(`premium:user:${userId}`);
    let guildValue = await redis.get(`premium:guild:${guildId}`);

    let userTTL = 0;
    if (userValue === "perm") userTTL = -1;
    else if (userValue) {
      userTTL = await redis.ttl(`premium:user:${userId}`);
      if (userTTL < 0) userTTL = 0;
    }

    let guildTTL = 0;
    if (guildValue === "perm") guildTTL = -1;
    else if (guildValue) {
      guildTTL = await redis.ttl(`premium:guild:${guildId}`);
      if (guildTTL < 0) guildTTL = 0;
    }

    const buildEmbed = () => {
      const embed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setAuthor({ name: "💎 Premium Dashboard", iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          {
            name: "👤 User Premium",
            value: userValue ? (userValue === "perm" ? "♾️ Lifetime" : `Active\n${formatTTL(userTTL)}`) : "❌ Inactive",
            inline: true
          },
          {
            name: "🏢 Guild Premium",
            value: guildValue ? (guildValue === "perm" ? "♾️ Lifetime" : `Active\n${formatTTL(guildTTL)}`) : "❌ Inactive",
            inline: true
          }
        )
        .setFooter({ text: "Redeem a code using the button below." })
        .setTimestamp();
      return embed;
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("premium_refresh")
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("premium_redeem")
        .setLabel("Redeem Code")
        .setEmoji("🎟️")
        .setStyle(ButtonStyle.Success)
    );

    const msg = await interaction.reply({
      embeds: [buildEmbed()],
      components: [row],
      withResponse: true
    });
    const replyMsg = msg.resource.message;

    const collector = replyMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
      filter: i => i.user.id === userId
    });

    collector.on("collect", async i => {
      if (i.customId === "premium_refresh") {
        // Re-fetch
        const newUser = await redis.get(`premium:user:${userId}`);
        const newGuild = await redis.get(`premium:guild:${guildId}`);
        userValue = newUser; guildValue = newGuild;
        if (newUser === "perm") userTTL = -1;
        else if (newUser) { userTTL = await redis.ttl(`premium:user:${userId}`); if (userTTL < 0) userTTL = 0; }
        else userTTL = 0;
        if (newGuild === "perm") guildTTL = -1;
        else if (newGuild) { guildTTL = await redis.ttl(`premium:guild:${guildId}`); if (guildTTL < 0) guildTTL = 0; }
        else guildTTL = 0;
        return i.update({ embeds: [buildEmbed()], components: [row] });
      }

      if (i.customId === "premium_redeem") {
        await i.reply({
          content: "🎟️ Please type your redeem code in chat. You have **30 seconds**.",
          flags: MessageFlags.Ephemeral
        });

        try {
          const collected = await i.channel.awaitMessages({
            filter: m => m.author.id === userId && !m.author.bot,
            max: 1,
            time: 30000,
            errors: ['time']
          });

          const message = collected.first();
          const code = message.content.trim().toUpperCase();
          await message.delete().catch(() => {});

          const raw = await redis.get(`redeem:${code}`);
          if (!raw) {
            return i.followUp({ content: "❌ Invalid code.", flags: MessageFlags.Ephemeral });
          }

          const data = JSON.parse(raw);

          // Check expiry and uses
          if (data.uses <= 0) {
            await redis.del(`redeem:${code}`);
            return i.followUp({ content: "❌ Code fully used.", flags: MessageFlags.Ephemeral });
          }
          if (data.seconds !== -1 && (Date.now() - data.createdAt) > data.seconds * 1000) {
            await redis.del(`redeem:${code}`);
            return i.followUp({ content: "❌ Code expired.", flags: MessageFlags.Ephemeral });
          }
          if (data.users && data.users.includes(userId)) {
            return i.followUp({ content: "❌ You already used this code.", flags: MessageFlags.Ephemeral });
          }

          // --- FIX: Determine premium type ---
          const premiumKey = data.type === "guild" ? `premium:guild:${guildId}` : `premium:user:${userId}`;

          // Apply premium
          if (data.duration === "perm") {
            await redis.set(premiumKey, "perm");
          } else {
            await redis.set(premiumKey, "active");
            await redis.expire(premiumKey, data.seconds);
          }

          // Give coins if any
          if (data.giveCoins && data.coinAmount > 0) {
            await redis.incrby(`eco:${userId}:money`, data.coinAmount);
          }

          // Update code usage
          data.used++;
          if (!data.users) data.users = [];
          data.users.push(userId);
          if (data.used >= data.uses) {
            await redis.del(`redeem:${code}`);
          } else {
            await redis.set(`redeem:${code}`, JSON.stringify(data));
          }

          const rewardEmbed = new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("✅ Premium Activated!")
            .setDescription(`You redeemed **${code}** for **${data.type === 'guild' ? 'Guild' : 'User'}** premium.`)
            .addFields(
              { name: "Duration", value: data.duration === "perm" ? "♾️ Lifetime" : data.duration, inline: true },
              { name: "Coins", value: data.giveCoins ? `+${data.coinAmount}` : "None", inline: true }
            )
            .setTimestamp();

          return i.followUp({ embeds: [rewardEmbed], flags: MessageFlags.Ephemeral });

        } catch (error) {
          if (error.code === 'time') {
            return i.followUp({ content: "⌛ Timed out.", flags: MessageFlags.Ephemeral });
          }
          console.error("Redeem error:", error);
          return i.followUp({ content: "❌ Error redeeming code.", flags: MessageFlags.Ephemeral });
        }
      }
    });

    collector.on("end", async () => {
      const disabledRow = new ActionRowBuilder().addComponents(
        row.components.map(b => ButtonBuilder.from(b).setDisabled(true))
      );
      await interaction.editReply({ components: [disabledRow] }).catch(() => {});
    });
  }
};

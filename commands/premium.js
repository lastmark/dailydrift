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

/* =========================
   FORMAT TTL
========================= */
function formatTTL(ttl) {
  if (ttl === -1) return "♾️ Lifetime Access";
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
    .setDescription("💎 Unified Premium Control Dashboard"),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // =========================
    // FETCH PREMIUM DATA
    // =========================
    const userValue = await redis.get(`premium:user:${userId}`);
    const guildValue = await redis.get(`premium:guild:${guildId}`);

    // Get TTL properly
    let userTTL = 0;
    if (userValue === "perm") {
      userTTL = -1;
    } else if (userValue) {
      userTTL = await redis.ttl(`premium:user:${userId}`);
      if (userTTL < 0) userTTL = 0;
    }

    let guildTTL = 0;
    if (guildValue === "perm") {
      guildTTL = -1;
    } else if (guildValue) {
      guildTTL = await redis.ttl(`premium:guild:${guildId}`);
      if (guildTTL < 0) guildTTL = 0;
    }

    // =========================
    // BUILD DASHBOARD EMBED
    // =========================
    const buildEmbed = () => {
      const embed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setAuthor({
          name: "💎 Premium Control Dashboard",
          iconURL: interaction.user.displayAvatarURL()
        })
        .setDescription("Unified license system status overview.")
        .addFields(
          {
            name: "👤 User Premium",
            value: userValue
              ? userValue === "perm"
                ? "♾️ Lifetime Active"
                : `💎 Active\n${formatTTL(userTTL)}`
              : "❌ Not Active",
            inline: true
          },
          {
            name: "🏢 Server Premium",
            value: guildValue
              ? guildValue === "perm"
                ? "♾️ Lifetime Active"
                : `💎 Active\n${formatTTL(guildTTL)}`
              : "❌ Not Active",
            inline: true
          }
        )
        .setFooter({ text: "Buttons expire in 2 minutes" })
        .setTimestamp();

      // Add developer info if applicable
      if (userId === DEV_ID) {
        embed.addFields({
          name: "🔧 Developer Mode",
          value: "You have full access to all premium features.",
          inline: false
        });
      }

      return embed;
    };

    // =========================
    // BUTTON PANEL
    // =========================
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
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("premium_info")
        .setLabel("Info")
        .setEmoji("ℹ️")
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await interaction.reply({
      embeds: [buildEmbed()],
      components: [row],
      fetchReply: true
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
      filter: i => i.user.id === userId
    });

    // =========================
    // BUTTON HANDLER
    // =========================
    collector.on("collect", async i => {
      // REFRESH
      if (i.customId === "premium_refresh") {
        // Re-fetch data
        const newUserValue = await redis.get(`premium:user:${userId}`);
        const newGuildValue = await redis.get(`premium:guild:${guildId}`);
        
        // Update TTLs
        let newUserTTL = 0;
        if (newUserValue === "perm") {
          newUserTTL = -1;
        } else if (newUserValue) {
          newUserTTL = await redis.ttl(`premium:user:${userId}`);
          if (newUserTTL < 0) newUserTTL = 0;
        }

        let newGuildTTL = 0;
        if (newGuildValue === "perm") {
          newGuildTTL = -1;
        } else if (newGuildValue) {
          newGuildTTL = await redis.ttl(`premium:guild:${guildId}`);
          if (newGuildTTL < 0) newGuildTTL = 0;
        }

        // Update variables for the embed builder
        userValue = newUserValue;
        guildValue = newGuildValue;
        userTTL = newUserTTL;
        guildTTL = newGuildTTL;

        return i.update({ 
          embeds: [buildEmbed()], 
          components: [row] 
        });
      }

      // REDEEM
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
          
          // Delete the message to keep chat clean
          await message.delete().catch(() => {});

          // Get code data
          const raw = await redis.get(`redeem:${code}`);
          if (!raw) {
            return i.followUp({
              content: "❌ Invalid or expired code.",
              flags: MessageFlags.Ephemeral
            });
          }

          const data = JSON.parse(raw);

          // Check if code has remaining uses
          if (data.uses <= 0) {
            await redis.del(`redeem:${code}`);
            return i.followUp({
              content: "❌ This code has been fully used.",
              flags: MessageFlags.Ephemeral
            });
          }

          // Check if code has expired
          if (data.seconds !== -1) {
            const expiresAt = data.createdAt + (data.seconds * 1000);
            if (Date.now() > expiresAt) {
              await redis.del(`redeem:${code}`);
              return i.followUp({
                content: "❌ This code has expired.",
                flags: MessageFlags.Ephemeral
              });
            }
          }

          // Check if user already used this code
          if (data.users && data.users.includes(userId)) {
            return i.followUp({
              content: "❌ You have already used this code.",
              flags: MessageFlags.Ephemeral
            });
          }

          // APPLY PREMIUM
          if (data.duration === "perm") {
            await redis.set(`premium:user:${userId}`, "perm");
          } else {
            await redis.set(`premium:user:${userId}`, "active");
            await redis.expire(`premium:user:${userId}`, data.seconds);
          }

          // Give coins if specified
          if (data.coins && data.coins > 0) {
            await redis.incrby(`eco:${userId}:money`, data.coins);
          }

          // Give premium access if specified
          if (data.isPremium) {
            await redis.set(`eco:${userId}:vip`, "true");
          }

          // UPDATE CODE USAGE
          data.uses--;
          if (!data.users) data.users = [];
          data.users.push(userId);
          
          if (data.uses <= 0) {
            await redis.del(`redeem:${code}`);
          } else {
            await redis.set(`redeem:${code}`, JSON.stringify(data));
          }

          // Build response embed
          const rewardEmbed = new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("✅ Premium Activated!")
            .setDescription(`You successfully redeemed **${code}**`)
            .addFields(
              {
                name: "📦 Rewards",
                value: [
                  data.duration === "perm" ? "♾️ Lifetime Premium" : `⏳ Premium for ${data.duration}`,
                  data.coins > 0 ? `💰 ${data.coins} coins` : null,
                  data.isPremium ? "👑 VIP Access" : null
                ].filter(Boolean).join("\n") || "No additional rewards",
                inline: false
              },
              {
                name: "📊 Remaining Uses",
                value: `**${data.uses}** / ${data.uses + 1}`,
                inline: true
              }
            )
            .setFooter({ text: "Your premium features are now active!" })
            .setTimestamp();

          return i.followUp({
            embeds: [rewardEmbed],
            flags: MessageFlags.Ephemeral
          });

        } catch (error) {
          if (error.code === 'time') {
            return i.followUp({
              content: "⌛ Timed out. Please run the command again.",
              flags: MessageFlags.Ephemeral
            });
          }
          console.error("Redeem error:", error);
          return i.followUp({
            content: "❌ An error occurred while redeeming the code.",
            flags: MessageFlags.Ephemeral
          });
        }
      }

      // INFO
      if (i.customId === "premium_info") {
        const infoEmbed = new EmbedBuilder()
          .setColor("#5865F2")
          .setTitle("ℹ️ Premium Features")
          .setDescription("Here's what you get with Premium:")
          .addFields(
            {
              name: "👤 User Premium",
              value: "• Custom profile backgrounds\n• Exclusive profile frames\n• Premium badges\n• Double XP in games",
              inline: false
            },
            {
              name: "🏢 Server Premium",
              value: "• Custom server backgrounds\n• Exclusive server perks\n• Enhanced server features",
              inline: false
            },
            {
              name: "🎟️ How to Get Premium",
              value: "1. Use `/premium` and click 'Redeem Code'\n2. Enter a valid premium code\n3. Enjoy your premium benefits!",
              inline: false
            }
          )
          .setFooter({ text: "Premium codes can be generated by developers" })
          .setTimestamp();

        return i.reply({
          embeds: [infoEmbed],
          flags: MessageFlags.Ephemeral
        });
      }
    });

    // =========================
    // DISABLE BUTTONS AFTER TIME
    // =========================
    collector.on("end", async () => {
      const disabledRow = new ActionRowBuilder().addComponents(
        row.components.map(b =>
          ButtonBuilder.from(b).setDisabled(true)
        )
      );

      await interaction.editReply({ 
        components: [disabledRow] 
      }).catch(() => {});
    });
  }
};

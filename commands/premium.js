const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
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

  return `⏳ ${d}d ${h}h ${m}m`;
}

module.exports = {
  category: "Premium",

  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("💎 Unified Premium Control Dashboard"),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    /* =========================
       FETCH PREMIUM DATA
    ========================= */
    const userValue = await redis.get(`premium:user:${userId}`);
    const guildValue = await redis.get(`premium:guild:${guildId}`);

    const userTTL =
      userValue === "perm"
        ? -1
        : await redis.ttl(`premium:user:${userId}`);

    const guildTTL =
      guildValue === "perm"
        ? -1
        : await redis.ttl(`premium:guild:${guildId}`);

    /* =========================
       BUILD DASHBOARD EMBED
    ========================= */
    const buildEmbed = () =>
      new EmbedBuilder()
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
              : "❌ Not Active"
          },
          {
            name: "🏢 Server Premium",
            value: guildValue
              ? guildValue === "perm"
                ? "♾️ Lifetime Active"
                : `💎 Active\n${formatTTL(guildTTL)}`
              : "❌ Not Active"
          }
        );

    /* =========================
       BUTTON PANEL
    ========================= */
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("refresh")
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("redeem")
        .setLabel("Redeem Code")
        .setEmoji("🎟️")
        .setStyle(ButtonStyle.Success)
    );

    const msg = await interaction.reply({
      embeds: [buildEmbed()],
      components: [row],
      fetchReply: true
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000
    });

    /* =========================
       BUTTON HANDLER
    ========================= */
    collector.on("collect", async i => {
      if (i.user.id !== userId)
        return i.reply({ content: "Not your panel.", ephemeral: true });

      /* ===== REFRESH ===== */
      if (i.customId === "refresh") {
        return i.update({ embeds: [buildEmbed()] });
      }

      /* ===== REDEEM ===== */
      if (i.customId === "redeem") {
        await i.reply({
          content: "🎟️ Send your redeem code in chat (30s)...",
          ephemeral: true
        });

        const collected = await i.channel
          .awaitMessages({
            filter: m => m.author.id === userId,
            max: 1,
            time: 30000
          })
          .catch(() => null);

        if (!collected)
          return i.followUp({
            content: "⌛ Timed out.",
            ephemeral: true
          });

        const code = collected.first().content.trim().toUpperCase();
        const raw = await redis.get(`redeem:${code}`);

        if (!raw)
          return i.followUp({
            content: "❌ Invalid code.",
            ephemeral: true
          });

        const data = JSON.parse(raw);

        /* =========================
           APPLY PREMIUM
        ========================= */
        if (data.duration === "perm") {
          await redis.set(`premium:user:${userId}`, "perm");
        } else {
          await redis.set(`premium:user:${userId}`, "active");
          await redis.expire(`premium:user:${userId}`, data.seconds);
        }

        /* =========================
           UPDATE USES
        ========================= */
        data.uses--;

        if (data.uses <= 0) {
          await redis.del(`redeem:${code}`);
        } else {
          await redis.set(`redeem:${code}`, JSON.stringify(data));
        }

        return i.followUp({
          content:
            "💎 Redeemed Successfully!\n✨ Premium Activated",
          ephemeral: true
        });
      }
    });

    /* =========================
       DISABLE BUTTONS AFTER TIME
    ========================= */
    collector.on("end", async () => {
      const disabledRow = new ActionRowBuilder().addComponents(
        row.components.map(b =>
          ButtonBuilder.from(b).setDisabled(true)
        )
      );

      await interaction
        .editReply({ components: [disabledRow] })
        .catch(() => {});
    });
  }
};

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require("discord.js");

const DEV_ID = "1303357369622990889";

/* =========================
   FORMAT TTL
========================= */
function formatTTL(ttlSeconds) {
  if (ttlSeconds === -1) return "♾️ Permanent Access";
  if (ttlSeconds <= 0) return "❌ Inactive";

  const d = Math.floor(ttlSeconds / 86400);
  const h = Math.floor((ttlSeconds % 86400) / 3600);
  const m = Math.floor((ttlSeconds % 3600) / 60);

  return `⏳ ${d}d ${h}h ${m}m`;
}

module.exports = {
  category: "Premium",

  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("💎 Premium dashboard + redeem system"),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const userValue = await redis.get(`premium:user:${userId}`);
    const guildValue = await redis.get(`premium:guild:${guildId}`);

    const userTTL = userValue === "perm"
      ? -1
      : await redis.ttl(`premium:user:${userId}`);

    const guildTTL = guildValue === "perm"
      ? -1
      : await redis.ttl(`premium:guild:${guildId}`);

    /* =========================
       DASHBOARD EMBED
    ========================= */
    const embed = new EmbedBuilder()
      .setColor("#F1C40F")
      .setTitle("💎 Premium Control Hub")
      .setDescription("Manage your premium access below")
      .addFields(
        {
          name: "👤 User Status",
          value: userValue
            ? `💎 Active\n${formatTTL(userTTL)}`
            : "❌ Not Active"
        },
        {
          name: "🏢 Server Status",
          value: guildValue
            ? `💎 Active\n${formatTTL(guildTTL)}`
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
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("redeem")
        .setLabel("Redeem Code")
        .setStyle(ButtonStyle.Success)
    );

    const msg = await interaction.reply({
      embeds: [embed],
      components: [row],
      fetchReply: true
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000
    });

    collector.on("collect", async i => {
      if (i.user.id !== userId) {
        return i.reply({
          content: "❌ Not your panel.",
          flags: MessageFlags.Ephemeral
        });
      }

      /* ================= REFRESH ================= */
      if (i.customId === "refresh") {
        return i.update({ embeds: [embed] });
      }

      /* ================= REDEEM MODAL ================= */
      if (i.customId === "redeem") {
        const modal = new ModalBuilder()
          .setCustomId("redeem_modal")
          .setTitle("Redeem Premium Code");

        const input = new TextInputBuilder()
          .setCustomId("code")
          .setLabel("Enter redeem code")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return i.showModal(modal);
      }
    });

    collector.on("end", async () => {
      const disabled = new ActionRowBuilder().addComponents(
        row.components.map(btn =>
          ButtonBuilder.from(btn).setDisabled(true)
        )
      );

      await interaction.editReply({
        components: [disabled]
      }).catch(() => {});
    });

    /* =========================
       GLOBAL MODAL HANDLER
       (SAFE SINGLE REGISTRATION)
    ========================= */
    if (!client.__redeemHandlerAdded) {
      client.__redeemHandlerAdded = true;

      client.on("interactionCreate", async i => {
        if (!i.isModalSubmit()) return;
        if (i.customId !== "redeem_modal") return;

        const code = i.fields.getTextInputValue("code").trim().toUpperCase();
        const raw = await redis.get(`redeem:${code}`);

        if (!raw) {
          return i.reply({
            content: "❌ Invalid or expired code.",
            flags: MessageFlags.Ephemeral
          });
        }

        const data = JSON.parse(raw);

        // 🔥 ALWAYS CONSUME CODE FIRST (prevents reuse exploit)
        await redis.del(`redeem:${code}`);

        if (data.type === "user") {
          if (data.duration === "perm") {
            await redis.set(`premium:user:${i.user.id}`, "perm");
          } else {
            await redis.set(`premium:user:${i.user.id}`, "active");
            if (data.seconds > 0) {
              await redis.expire(`premium:user:${i.user.id}`, data.seconds);
            }
          }
        }

        return i.reply({
          content: "💎 Premium activated successfully!",
          flags: MessageFlags.Ephemeral
        });
      });
    }
  }
};

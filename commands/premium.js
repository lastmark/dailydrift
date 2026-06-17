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

    const key = `premium:user:${userId}`;

    const value = await redis.get(key);
    const ttl = await redis.ttl(key);

    const isPremium = value === "perm" || ttl > 0;

    /* =========================
       DASHBOARD
    ========================= */
    const embed = new EmbedBuilder()
      .setColor("#F1C40F")
      .setTitle("💎 Premium Control Hub")
      .addFields(
        {
          name: "👤 User Status",
          value: isPremium
            ? `💎 Active\n${formatTTL(value === "perm" ? -1 : ttl)}`
            : "❌ Not Active"
        },
        {
          name: "🏢 Server Status",
          value: "⚙️ (Server system separate)"
        }
      );

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

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });

    const msg = await interaction.fetchReply();

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
        const newValue = await redis.get(key);
        const newTTL = await redis.ttl(key);

        const newEmbed = new EmbedBuilder()
          .setColor("#F1C40F")
          .setTitle("💎 Premium Control Hub")
          .addFields(
            {
              name: "👤 User Status",
              value: newValue === "perm" || newTTL > 0
                ? `💎 Active\n${formatTTL(newValue === "perm" ? -1 : newTTL)}`
                : "❌ Not Active"
            },
            {
              name: "🏢 Server Status",
              value: "⚙️ (Server system separate)"
            }
          );

        return i.update({ embeds: [newEmbed] });
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
       GLOBAL REDEEM HANDLER
    ========================= */
    if (!client.__redeemHandler) {
      client.__redeemHandler = true;

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

        // 🔥 ALWAYS DELETE FIRST (prevents reuse exploit)
        await redis.del(`redeem:${code}`);

        const userKey = `premium:user:${i.user.id}`;

        /* ================= APPLY PREMIUM ================= */
        if (data.duration === "perm") {
          await redis.set(userKey, "perm");
        } else {
          await redis.set(userKey, "1");

          if (data.seconds > 0) {
            await redis.expire(userKey, data.seconds);
          }
        }

        return i.reply({
          content: "💎 Premium Activated Successfully!",
          flags: MessageFlags.Ephemeral
        });
      });
    }
  }
};

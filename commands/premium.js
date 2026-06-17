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
   FORMAT TIME
========================= */
function formatTTL(ttlSeconds) {
  if (ttlSeconds === -1) return "♾️ Permanent Access";
  if (ttlSeconds <= 0) return "❌ Inactive";

  const d = Math.floor(ttlSeconds / 86400);
  const h = Math.floor((ttlSeconds % 86400) / 3600);
  const m = Math.floor((ttlSeconds % 3600) / 60);

  return `⏳ ${d}d ${h}h ${m}m`;
}

/* =========================
   DURATION PARSER
========================= */
function durationToSeconds(input) {
  if (input === "perm") return -1;

  const match = input.match(/(\d+)(d|h|m)/);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const type = match[2];

  if (type === "d") return value * 86400;
  if (type === "h") return value * 3600;
  if (type === "m") return value * 60;

  return 0;
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

    const userTTL =
      userValue === "perm"
        ? -1
        : await redis.ttl(`premium:user:${userId}`);

    const guildTTL =
      guildValue === "perm"
        ? -1
        : await redis.ttl(`premium:guild:${guildId}`);

    /* =========================
       EMBED
    ========================= */
    const embed = new EmbedBuilder()
      .setColor("#F1C40F")
      .setAuthor({
        name: "💎 Premium Control Hub",
        iconURL: interaction.user.displayAvatarURL()
      })
      .setDescription("Select an action below:")
      .addFields(
        {
          name: "👤 User",
          value: userValue
            ? `💎 Active\n${formatTTL(userTTL)}`
            : "❌ Not Active"
        },
        {
          name: "🏢 Server",
          value: guildValue
            ? `💎 Active\n${formatTTL(guildTTL)}`
            : "❌ Not Active"
        }
      );

    /* =========================
       BUTTONS
    ========================= */
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("view")
        .setLabel("View")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("redeem")
        .setLabel("Redeem")
        .setEmoji("🎟️")
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
      if (i.user.id !== userId)
        return i.reply({ content: "Not your panel.", ephemeral: true });

      /* =========================
         VIEW REFRESH
      ========================= */
      if (i.customId === "view") {
        return i.update({ embeds: [embed] });
      }

      /* =========================
         REDEEM SYSTEM (FULL HERE)
      ========================= */
      if (i.customId === "redeem") {
        await i.reply({
          content: "🎟️ Send your redeem code in chat...",
          ephemeral: true
        });

        const collected = await i.channel.awaitMessages({
          filter: m => m.user.id === userId,
          max: 1,
          time: 30000
        }).catch(() => null);

        if (!collected) {
          return i.followUp({
            content: "⌛ Timed out.",
            ephemeral: true
          });
        }

        const code = collected.first().content.trim().toUpperCase();
        const raw = await redis.get(`redeem:${code}`);

        if (!raw) {
          return i.followUp({
            content: "❌ Invalid code.",
            ephemeral: true
          });
        }

        const data = JSON.parse(raw);

        if (data.uses <= 0) {
          await redis.del(`redeem:${code}`);
          return i.followUp({
            content: "❌ Code expired.",
            ephemeral: true
          });
        }

        // apply premium
        if (data.duration === "perm") {
          await redis.set(`premium:user:${userId}`, "perm");
        } else {
          await redis.set(`premium:user:${userId}`, "active");
          if (data.seconds > 0) {
            await redis.expire(`premium:user:${userId}`, data.seconds);
          }
        }

        // reduce uses
        data.uses -= 1;

        if (data.uses <= 0) {
          await redis.del(`redeem:${code}`);
        } else {
          await redis.set(`redeem:${code}`, JSON.stringify(data));
        }

        return i.followUp({
          content:
            `💎 **Redeemed Successfully**\n` +
            `🎟️ Code: **${code}**\n` +
            `✨ Premium Activated`,
          ephemeral: true
        });
      }
    });

    collector.on("end", async () => {
      const disabled = new ActionRowBuilder().addComponents(
        row.components.map(b => ButtonBuilder.from(b).setDisabled(true))
      );

      await interaction.editReply({
        components: [disabled]
      }).catch(() => {});
    });
  }
};

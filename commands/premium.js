const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
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
    .setDescription("💎 Interactive premium control dashboard"),

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

    // =========================
    // EMBEDS (PAGES)
    // =========================
    const buildUserPage = () =>
      new EmbedBuilder()
        .setColor("#F1C40F")
        .setAuthor({
          name: "💎 Premium Dashboard • User Panel",
          iconURL: interaction.user.displayAvatarURL()
        })
        .setDescription("👤 Personal subscription overview")
        .addFields({
          name: "Status",
          value: userValue
            ? `💎 ACTIVE\n${formatTTL(userTTL)}`
            : "❌ Not Active"
        });

    const buildServerPage = () =>
      new EmbedBuilder()
        .setColor("#5865F2")
        .setAuthor({
          name: "🏢 Server Premium Panel",
          iconURL: interaction.guild.iconURL()
        })
        .setDescription("Guild subscription overview")
        .addFields({
          name: "Status",
          value: guildValue
            ? `💎 ACTIVE\n${formatTTL(guildTTL)}`
            : "❌ Not Active"
        });

    const buildInfoPage = () =>
      new EmbedBuilder()
        .setColor("#2B2D31")
        .setTitle("📊 Premium System Info")
        .setDescription(
          "• 💎 User perks\n• 🏢 Server perks\n• ⚙️ Upgrade options available"
        );

    let page = "user";

    const getEmbed = () => {
      if (page === "user") return buildUserPage();
      if (page === "server") return buildServerPage();
      return buildInfoPage();
    };

    // =========================
    // BUTTON ROW
    // =========================
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("user")
        .setLabel("User")
        .setEmoji("👤")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("server")
        .setLabel("Server")
        .setEmoji("🏢")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("info")
        .setLabel("Info")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("refresh")
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("upgrade")
        .setLabel("Upgrade")
        .setEmoji("💎")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("redeem")
        .setLabel("Redeem Key")
        .setEmoji("🎟️")
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await interaction.reply({
      embeds: [getEmbed()],
      components: [row, row2],
      fetchReply: true
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000
    });

    collector.on("collect", async i => {
      if (i.user.id !== userId)
        return i.reply({ content: "Not your panel.", ephemeral: true });

      // =========================
      // NAVIGATION
      // =========================
      if (i.customId === "user") page = "user";
      if (i.customId === "server") page = "server";
      if (i.customId === "info") page = "info";

      // =========================
      // REFRESH
      // =========================
      if (i.customId === "refresh") {
        const freshUser = await redis.get(`premium:user:${userId}`);
        const freshGuild = await redis.get(`premium:guild:${guildId}`);

        page = "user";

        return i.update({
          embeds: [buildUserPage()],
          components: [row, row2]
        });
      }

      // =========================
      // UPGRADE HOOK (PLACEHOLDER)
      // =========================
      if (i.customId === "upgrade") {
        return i.reply({
          content: "💎 Upgrade system coming soon (hook ready)",
          ephemeral: true
        });
      }

      // =========================
      // REDEEM HOOK (PLACEHOLDER)
      // =========================
      if (i.customId === "redeem") {
        return i.reply({
          content: "🎟️ Redeem system hook ready",
          ephemeral: true
        });
      }

      return i.update({
        embeds: [getEmbed()],
        components: [row, row2]
      });
    });

    collector.on("end", async () => {
      const disabled = [row, row2].map(r =>
        new ActionRowBuilder().addComponents(
          r.components.map(b => ButtonBuilder.from(b).setDisabled(true))
        )
      );

      await interaction.editReply({
        components: disabled
      }).catch(() => {});
    });
  }
};

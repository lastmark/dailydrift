// commands/afk.js – AFK System
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  category: "User",
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set or clear your AFK status")
    .addSubcommand(sub =>
      sub.setName("set")
        .setDescription("Go AFK with an optional reason")
        .addStringOption(opt =>
          opt.setName("reason")
            .setDescription("Why you are AFK")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName("clear")
        .setDescription("Remove your AFK status")
    )
    .setDMPermission(false),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "set") {
      const reason = interaction.options.getString("reason") || "AFK";
      const data = {
        reason,
        since: Date.now(),
      };
      await redis.set(`afk:${userId}`, JSON.stringify(data));

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("💤 AFK Set")
        .setDescription(`${interaction.user} is now AFK.`)
        .addFields({ name: "Reason", value: reason })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "clear") {
      const exists = await redis.get(`afk:${userId}`);
      if (!exists) {
        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription("❌ You are not AFK.");
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      await redis.del(`afk:${userId}`);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setDescription("✅ Your AFK status has been removed. Welcome back!")
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};

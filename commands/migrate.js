// commands/migrate.js – Temporary migration command (remove after use)
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("migrate")
    .setDescription("Migrate old guild-specific coins to global (dev only)"),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const DEV_ID = "1303357369622990889";

    if (userId !== DEV_ID) {
      return interaction.reply({
        content: "❌ Developer only.",
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guild.id;

    // Find all keys that match eco:guildId:*:money
    const pattern = `eco:${guildId}:*:money`;
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      return interaction.editReply({
        content: "✅ No guild-specific balances found. Nothing to migrate."
      });
    }

    let totalMigrated = 0;
    let userCount = 0;
    const results = [];

    for (const key of keys) {
      const parts = key.split(':');
      const userIdFromKey = parts[2];
      const oldBalance = Number(await redis.get(key) || 0);

      if (oldBalance > 0) {
        await redis.incrby(`eco:${userIdFromKey}:money`, oldBalance);
        await redis.del(key);
        totalMigrated += oldBalance;
        userCount++;
        results.push(`<@${userIdFromKey}> → ${oldBalance} coins`);
      } else {
        await redis.del(key); // clean up zero
      }
    }

    const embed = new EmbedBuilder()
      .setColor("#57F287")
      .setTitle("✅ Migration Complete")
      .setDescription(`Merged **${userCount}** users, total **${totalMigrated}** coins moved to global balances.`)
      .addFields(
        { name: "Details", value: results.slice(0, 10).join("\n") || "All done." }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};

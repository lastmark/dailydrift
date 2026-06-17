const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

const DEV_ID = "1303357369622990889";

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
  data: new SlashCommandBuilder()
    .setName("generatecode")
    .setDescription("Create premium redeem codes (DEV ONLY)")
    .addStringOption(o =>
      o.setName("code")
        .setDescription("Code name (will be uppercase)")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("duration")
        .setDescription("1d / 7d / 1h / perm")
        .setRequired(true)
        .addChoices(
          { name: "1 Hour", value: "1h" },
          { name: "6 Hours", value: "6h" },
          { name: "12 Hours", value: "12h" },
          { name: "1 Day", value: "1d" },
          { name: "3 Days", value: "3d" },
          { name: "7 Days", value: "7d" },
          { name: "30 Days", value: "30d" },
          { name: "Permanent", value: "perm" }
        )
    )
    .addIntegerOption(o =>
      o.setName("uses")
        .setDescription("How many people can use it")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000)
    )
    .addBooleanOption(o =>
      o.setName("premium")
        .setDescription("Give premium access?")
        .setRequired(false)
    )
    .addIntegerOption(o =>
      o.setName("coins")
        .setDescription("Coins to give (optional)")
        .setRequired(false)
        .setMinValue(1)
    ),

  async execute(interaction, client, redis) {
    // Check if developer
    if (interaction.user.id !== DEV_ID) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#ED4245")
            .setDescription("❌ This command is developer only.")
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      // Get options
      const code = interaction.options.getString("code").toUpperCase();
      const duration = interaction.options.getString("duration");
      const uses = interaction.options.getInteger("uses");
      const isPremium = interaction.options.getBoolean("premium") || false;
      const coins = interaction.options.getInteger("coins") || 0;

      // Validate duration
      const seconds = durationToSeconds(duration);
      if (seconds === 0 && duration !== "perm") {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("❌ Invalid duration format. Use: 1h, 1d, 7d, perm")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      // Check if code already exists
      const existing = await redis.get(`redeem:${code}`);
      if (existing) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`❌ Code **${code}** already exists. Please use a different code.`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      // Create the redeem data
      const redeemData = {
        code: code,
        duration: duration,
        seconds: seconds,
        uses: uses,
        used: 0,
        createdAt: Date.now(),
        createdBy: interaction.user.id,
        isPremium: isPremium,
        coins: coins,
        users: [] // Track who used it
      };

      // Store in Redis
      await redis.set(`redeem:${code}`, JSON.stringify(redeemData));

      // Also store in a set for easy listing
      await redis.sadd(`redeem:all_codes`, code);

      // Create response embed
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ Code Generated Successfully!")
        .setDescription(`Code **${code}** has been created.`)
        .addFields(
          { name: "🔑 Code", value: `\`${code}\``, inline: true },
          { name: "⏳ Duration", value: `**${duration}**`, inline: true },
          { name: "🔁 Uses", value: `**${uses}**`, inline: true },
          { name: "👑 Premium", value: isPremium ? "✅ Yes" : "❌ No", inline: true },
          { name: "💰 Coins", value: coins > 0 ? `**${coins}** coins` : "None", inline: true },
          { name: "📅 Created", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: "Users can redeem with /redeem <code>" })
        .setTimestamp();

      // Add to a log channel if you want
      // You can add logging here

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error("Error generating code:", error);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#ED4245")
            .setDescription("❌ An error occurred while generating the code.")
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

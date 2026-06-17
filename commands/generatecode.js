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
    .setDescription("🎟️ Create premium redeem codes (DEV ONLY)")
    .addStringOption(o =>
      o.setName("code")
        .setDescription("Code name")
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
    .addStringOption(o =>
      o.setName("type")
        .setDescription("What does this code grant?")
        .setRequired(true)
        .addChoices(
          { name: "User Premium", value: "user" },
          { name: "Guild Premium", value: "guild" }
        )
    )
    .addBooleanOption(o =>
      o.setName("coins")
        .setDescription("Give coins as well?")
        .setRequired(false)
    )
    .addIntegerOption(o =>
      o.setName("coin_amount")
        .setDescription("Amount of coins (if coins enabled)")
        .setRequired(false)
        .setMinValue(1)
    ),

  async execute(interaction, client, redis) {
    if (interaction.user.id !== DEV_ID) {
      return interaction.reply({ content: "❌ Developer only.", flags: MessageFlags.Ephemeral });
    }

    const code = interaction.options.getString("code").toUpperCase();
    const duration = interaction.options.getString("duration");
    const uses = interaction.options.getInteger("uses");
    const type = interaction.options.getString("type");
    const giveCoins = interaction.options.getBoolean("coins") || false;
    const coinAmount = interaction.options.getInteger("coin_amount") || 0;

    const seconds = durationToSeconds(duration);
    if (seconds === 0 && duration !== "perm") {
      return interaction.reply({ content: "❌ Invalid duration.", flags: MessageFlags.Ephemeral });
    }

    // Check if code exists
    if (await redis.get(`redeem:${code}`)) {
      return interaction.reply({ content: `❌ Code ${code} already exists.`, flags: MessageFlags.Ephemeral });
    }

    const data = {
      duration,
      seconds,
      uses,
      type, // 'user' or 'guild'
      used: 0,
      createdAt: Date.now(),
      createdBy: interaction.user.id,
      giveCoins,
      coinAmount,
      users: [] // track who used it
    };

    await redis.set(`redeem:${code}`, JSON.stringify(data));
    await redis.sadd(`redeem:all_codes`, code);

    const embed = new EmbedBuilder()
      .setColor("#57F287")
      .setTitle("✅ Code Generated")
      .setDescription(`Code **${code}** created.`)
      .addFields(
        { name: "Type", value: type === "user" ? "👤 User Premium" : "🏢 Guild Premium", inline: true },
        { name: "Duration", value: duration, inline: true },
        { name: "Uses", value: `${uses}`, inline: true },
        { name: "Coins", value: giveCoins ? `${coinAmount} coins` : "None", inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};

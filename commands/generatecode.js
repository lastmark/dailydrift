const { SlashCommandBuilder } = require("discord.js");

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
      o.setName("code").setDescription("Code").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("duration")
        .setDescription("1d / 7d / 1h / perm")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("uses")
        .setDescription("How many people can use it")
        .setRequired(true)
    ),

  async execute(interaction, client, redis) {
    if (interaction.user.id !== DEV_ID) {
      return interaction.reply({
        content: "❌ Developer only command.",
        ephemeral: true
      });
    }

    const code = interaction.options.getString("code").toUpperCase();
    const duration = interaction.options.getString("duration");
    const uses = interaction.options.getInteger("uses");

    const seconds = durationToSeconds(duration);

    const data = {
      duration,
      seconds,
      uses
    };

    await redis.set(`redeem:${code}`, JSON.stringify(data));

    return interaction.reply({
      content:
        `🎟️ **Code Generated**\n` +
        `🔑 Code: **${code}**\n` +
        `⏳ Duration: **${duration}**\n` +
        `🔁 Uses: **${uses}**`,
      ephemeral: true
    });
  }
};

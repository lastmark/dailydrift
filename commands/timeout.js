// commands/timeout.js – Flexible Timeout Duration Parser
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

/**
 * Parses a flexible time string into total milliseconds.
 * Supports combinations of days (d), hours (h), minutes (m).
 * Examples: "1d", "1h", "30m", "1h30m", "1d1h", "1d12h30m"
 * Returns null if the string is invalid.
 */
function parseDuration(input) {
  if (!input || typeof input !== 'string') return null;
  
  const normalized = input.toLowerCase().trim();
  if (!normalized) return null;

  let totalMs = 0;
  let hasValidUnit = false;

  // Match patterns like: 1d, 12h, 30m, 1d12h30m
  const regex = /(\d+)\s*(d|h|m)/g;
  let match;

  while ((match = regex.exec(normalized)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2];
    
    if (value < 1) return null;

    switch (unit) {
      case 'd': totalMs += value * 24 * 60 * 60 * 1000; break; // days
      case 'h': totalMs += value * 60 * 60 * 1000; break;      // hours
      case 'm': totalMs += value * 60 * 1000; break;           // minutes
    }
    hasValidUnit = true;
  }

  if (!hasValidUnit) return null;

  // Discord's maximum timeout is 28 days
  const maxMs = 28 * 24 * 60 * 60 * 1000;
  if (totalMs > maxMs) totalMs = maxMs;

  return totalMs;
}

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Apply a temporary communication restriction to a member")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("Target member to throttle")
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName("duration")
        .setDescription("Duration (e.g., 30m, 1h, 1d, 1h30m, 1d12h)")
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("Reason for the action")
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const durationInput = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason") || "No justification provided";

    // Parse the duration
    const ms = parseDuration(durationInput);
    
    if (!ms) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Invalid Duration Format**\nPlease use a combination of `d` (days), `h` (hours), `m` (minutes).\nExamples: `30m`, `1h`, `1h30m`, `1d`, `1d12h30m`")
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.timeout(ms, reason);

      // Calculate human‑readable duration for the embed
      const totalMinutes = Math.floor(ms / 60000);
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor((totalMinutes % 1440) / 60);
      const minutes = totalMinutes % 60;
      
      const parts = [];
      if (days > 0) parts.push(`${days} day(s)`);
      if (hours > 0) parts.push(`${hours} hour(s)`);
      if (minutes > 0) parts.push(`${minutes} minute(s)`);
      const readable = parts.join(', ') || '0 minutes';

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle("⏳ Member Communication Throttled")
        .addFields(
          { name: "Subject", value: `${user}`, inline: true },
          { name: "Duration", value: `\`${readable}\``, inline: true },
          { name: "Reason", value: reason, inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
      
    } catch (err) {
      console.error("Timeout Pipeline Exception:", err);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ Unable to apply the timeout. The selected user may have a higher role than the bot.")
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

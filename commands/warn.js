// commands/warn.js – Full Warn System
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Manage warnings for a user")
    .addSubcommand(sub =>
      sub.setName("add")
        .setDescription("Warn a member")
        .addUserOption(opt => opt.setName("user").setDescription("User to warn").setRequired(true))
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for the warning").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("remove")
        .setDescription("Remove a warning by its ID")
        .addUserOption(opt => opt.setName("user").setDescription("User").setRequired(true))
        .addIntegerOption(opt => opt.setName("id").setDescription("Warning number (#)").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("List warnings for a user")
        .addUserOption(opt => opt.setName("user").setDescription("User to check").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("clear")
        .setDescription("Clear all warnings for a user")
        .addUserOption(opt => opt.setName("user").setDescription("User").setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // Permission check
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("❌ You need the **Moderate Members** permission to manage warnings.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ---- ADD WARNING ----
    if (sub === "add") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "No reason provided";
      const key = `warnings:${guildId}:${user.id}`;

      let warnings = [];
      const raw = await redis.get(key);
      if (raw) warnings = JSON.parse(raw);

      const warnData = {
        id: warnings.length + 1,
        reason,
        moderator: interaction.user.tag,
        moderatorId: interaction.user.id,
        timestamp: Date.now()
      };
      warnings.push(warnData);
      await redis.set(key, JSON.stringify(warnings));

      const embed = new EmbedBuilder()
        .setColor("#FEE75C")
        .setTitle("⚠️ Warning Added")
        .setDescription(`**${user.tag}** has been warned.`)
        .addFields(
          { name: "Warning ID", value: `#${warnData.id}`, inline: true },
          { name: "Moderator", value: interaction.user.tag, inline: true },
          { name: "Reason", value: reason }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // DM the user (optional)
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor("#FEE75C")
          .setTitle("⚠️ Warning Received")
          .setDescription(`You have been warned in **${interaction.guild.name}**.`)
          .addFields(
            { name: "Reason", value: reason },
            { name: "Warning ID", value: `#${warnData.id}` }
          )
          .setTimestamp();
        await user.send({ embeds: [dmEmbed] });
      } catch (e) {
        // DMs closed, ignore
      }
      return;
    }

    // ---- REMOVE WARNING ----
    if (sub === "remove") {
      const user = interaction.options.getUser("user");
      const id = interaction.options.getInteger("id");
      const key = `warnings:${guildId}:${user.id}`;

      const raw = await redis.get(key);
      if (!raw) {
        const embed = new EmbedBuilder().setColor("#ED4245").setDescription(`❌ **${user.tag}** has no warnings.`);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      let warnings = JSON.parse(raw);
      const index = warnings.findIndex(w => w.id === id);
      if (index === -1) {
        const embed = new EmbedBuilder().setColor("#ED4245").setDescription(`❌ Warning **#${id}** not found.`);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const removed = warnings.splice(index, 1)[0];
      // Re-index remaining
      warnings.forEach((w, i) => { w.id = i + 1; });
      if (warnings.length === 0) {
        await redis.del(key);
      } else {
        await redis.set(key, JSON.stringify(warnings));
      }

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ Warning Removed")
        .setDescription(`Removed warning **#${id}** from **${user.tag}**.\n**Reason was:** ${removed.reason}`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ---- LIST WARNINGS ----
    if (sub === "list") {
      const user = interaction.options.getUser("user");
      const key = `warnings:${guildId}:${user.id}`;
      const raw = await redis.get(key);
      if (!raw) {
        const embed = new EmbedBuilder().setColor("#57F287").setDescription(`✅ **${user.tag}** has no warnings.`);
        return interaction.reply({ embeds: [embed] });
      }

      const warnings = JSON.parse(raw);
      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(`📋 Warnings for ${user.tag}`)
        .setDescription(
          warnings.map(w =>
            `**#${w.id}** – ${w.reason}\n` +
            `└ Moderator: ${w.moderator} • <t:${Math.floor(w.timestamp / 1000)}:R>`
          ).join("\n\n")
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ---- CLEAR ALL WARNINGS ----
    if (sub === "clear") {
      const user = interaction.options.getUser("user");
      const key = `warnings:${guildId}:${user.id}`;
      const exists = await redis.get(key);
      if (!exists) {
        const embed = new EmbedBuilder().setColor("#ED4245").setDescription(`❌ **${user.tag}** has no warnings to clear.`);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      await redis.del(key);
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ Warnings Cleared")
        .setDescription(`All warnings for **${user.tag}** have been cleared.`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
  }
};

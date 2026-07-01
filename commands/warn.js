// commands/warn.js – Advanced Warning Management System (MongoDB Optimized)
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Manage member warning logs")
    .addSubcommand(sub => sub.setName("add").setDescription("Issue a warning")
      .addUserOption(o => o.setName("user").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Justification")))
    .addSubcommand(sub => sub.setName("remove").setDescription("Remove a warning ID")
      .addUserOption(o => o.setName("user").setRequired(true))
      .addIntegerOption(o => o.setName("id").setRequired(true)))
    .addSubcommand(sub => sub.setName("list").setDescription("Display all warnings")
      .addUserOption(o => o.setName("user").setRequired(true)))
    .addSubcommand(sub => sub.setName("clear").setDescription("Clear all warnings")
      .addUserOption(o => o.setName("user").setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction, client, db) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user");
    const guildId = interaction.guild.id;
    const key = `warnings:${guildId}:${user.id}`;

    // --- ADD ---
    if (sub === "add") {
      const reason = interaction.options.getString("reason") || "No justification provided";
      const warnings = (await db.get(key)) || [];
      const newWarning = { id: warnings.length + 1, reason, moderator: interaction.user.tag, timestamp: Date.now() };
      
      await db.set(key, [...warnings, newWarning]);

      const embed = new EmbedBuilder().setColor("#0A0A0A").setTitle("⚠️ Warning Logged")
        .setDescription(`Member: ${user}\nReason: ${reason}\nID: \`#${newWarning.id}\``);
      
      await interaction.reply({ embeds: [embed] });
      await user.send({ embeds: [embed.setTitle("⚠️ Warning Received")] }).catch(() => null);
    }

    // --- REMOVE ---
    else if (sub === "remove") {
      const id = interaction.options.getInteger("id");
      let warnings = (await db.get(key)) || [];
      const filtered = warnings.filter(w => w.id !== id);

      if (warnings.length === filtered.length) return interaction.reply({ content: "❌ ID not found.", flags: MessageFlags.Ephemeral });
      
      // Re-index
      const updated = filtered.map((w, i) => ({ ...w, id: i + 1 }));
      await db.set(key, updated);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor("#0A0A0A").setDescription(`✅ Warning \`#${id}\` removed.`)] });
    }

    // --- LIST ---
    else if (sub === "list") {
      const warnings = (await db.get(key)) || [];
      if (warnings.length === 0) return interaction.reply({ content: "✅ No warnings found.", flags: MessageFlags.Ephemeral });

      const embed = new EmbedBuilder().setColor("#0A0A0A").setTitle(`📋 Warnings: ${user.username}`)
        .setDescription(warnings.map(w => `**#${w.id}** – ${w.reason} (<t:${Math.floor(w.timestamp / 1000)}:R>)`).join("\n"));
      
      await interaction.reply({ embeds: [embed] });
    }

    // --- CLEAR ---
    else if (sub === "clear") {
      await db.del(key);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor("#0A0A0A").setDescription(`✅ All warnings for ${user} cleared.`)] });
    }
  }
};

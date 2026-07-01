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

  async execute(interaction, client, db) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "set") {
      const reason = interaction.options.getString("reason") || "AFK";
      
      // Store clean native schema objects directly into MongoDB
      const data = {
        reason,
        since: Date.now(),
      };
      await db.set(`afk:${userId}`, data);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium minimalist look
        .setTitle("💤 Status Set")
        .setDescription(`${interaction.user} is now recorded as AFK.`)
        .addFields({ name: "💬 Context Details", value: `\`\`\`text\n${reason}\n\`\`\`` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "clear") {
      const exists = await db.get(`afk:${userId}`);
      if (!exists) {
        const embed = new EmbedBuilder()
          .setColor("#BA1A1A") // Minimalist warning layout dark-red tint
          .setDescription("❌ You do not have an active AFK status registration.");
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      
      await db.del(`afk:${userId}`);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setDescription("🟢 **Welcome back!** Your profile status has been re-activated and cleared.")
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};

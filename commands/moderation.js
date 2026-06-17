const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");
module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Moderation commands")
    // BAN
    .addSubcommand(sub =>
      sub
        .setName("ban")
        .setDescription("Ban a member")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User to ban")
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName("reason")
            .setDescription("Reason")
            .setRequired(false))
    )
    // KICK
    .addSubcommand(sub =>
      sub
        .setName("kick")
        .setDescription("Kick a member")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User to kick")
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName("reason")
            .setDescription("Reason")
            .setRequired(false))
    )
    // TIMEOUT
    .addSubcommand(sub =>
      sub
        .setName("timeout")
        .setDescription("Timeout a member")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User")
            .setRequired(true))
        .addIntegerOption(opt =>
          opt.setName("minutes")
            .setDescription("Minutes")
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName("reason")
            .setDescription("Reason")
            .setRequired(false))
    )
    // UNTIMEOUT
    .addSubcommand(sub =>
      sub
        .setName("untimeout")
        .setDescription("Remove timeout")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User")
            .setRequired(true))
    )
    // PURGE
    .addSubcommand(sub =>
      sub
        .setName("purge")
        .setDescription("Delete messages")
        .addIntegerOption(opt =>
          opt.setName("amount")
            .setDescription("1-100")
            .setRequired(true))
    )
    // LOCK
    .addSubcommand(sub =>
      sub
        .setName("lock")
        .setDescription("Lock channel")
    )
    // UNLOCK
    .addSubcommand(sub =>
      sub
        .setName("unlock")
        .setDescription("Unlock channel")
    )
    // SLOWMODE
    .addSubcommand(sub =>
      sub
        .setName("slowmode")
        .setDescription("Set slowmode")
        .addIntegerOption(opt =>
          opt.setName("seconds")
            .setDescription("Seconds")
            .setRequired(true))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    try {
      // ================= BAN =================
      if (sub === "ban") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers))
          return interaction.reply({ content: "❌ Missing permission.", ephemeral: true });
        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason";
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member)
          return interaction.reply("❌ Member not found.");
        await member.ban({ reason });
        return interaction.reply(`🔨 Banned **${user.tag}**\nReason: ${reason}`);
      }
      // ================= KICK =================
      if (sub === "kick") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers))
          return interaction.reply({ content: "❌ Missing permission.", ephemeral: true });
        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason";
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member)
          return interaction.reply("❌ Member not found.");
        await member.kick(reason);
        return interaction.reply(`👢 Kicked **${user.tag}**\nReason: ${reason}`);
      }
      // ================= TIMEOUT =================
      if (sub === "timeout") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
          return interaction.reply({ content: "❌ Missing permission.", ephemeral: true });
        const user = interaction.options.getUser("user");
        const minutes = interaction.options.getInteger("minutes");
        const reason = interaction.options.getString("reason") || "No reason";
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member)
          return interaction.reply("❌ Member not found.");
        await member.timeout(minutes * 60 * 1000, reason);
        return interaction.reply(
          `⏳ Timed out **${user.tag}** for **${minutes} minute(s)**`
        );
      }
      // ================= UNTIMEOUT =================
      if (sub === "untimeout") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
          return interaction.reply({ content: "❌ Missing permission.", ephemeral: true });
        const user = interaction.options.getUser("user");
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member)
          return interaction.reply("❌ Member not found.");
        await member.timeout(null);
        return interaction.reply(`✅ Removed timeout from **${user.tag}**`);
      }
      // ================= PURGE =================
      if (sub === "purge") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
          return interaction.reply({ content: "❌ Missing permission.", ephemeral: true });
        const amount = interaction.options.getInteger("amount");
        if (amount < 1 || amount > 100)
          return interaction.reply("❌ Amount must be between 1 and 100.");
        await interaction.channel.bulkDelete(amount, true);
        return interaction.reply({
          content: `🗑 Deleted ${amount} messages.`,
          ephemeral: true
        });
      }
      // ================= LOCK =================
      if (sub === "lock") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
          return interaction.reply({ content: "❌ Missing permission.", ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          {
            SendMessages: false
          }
        );
        return interaction.reply("🔒 Channel locked.");
      }
      // ================= UNLOCK =================
      if (sub === "unlock") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
          return interaction.reply({ content: "❌ Missing permission.", ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          {
            SendMessages: null
          }
        );
        return interaction.reply("🔓 Channel unlocked.");
      }
      // ================= SLOWMODE =================
      if (sub === "slowmode") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
          return interaction.reply({ content: "❌ Missing permission.", ephemeral: true });
        const seconds = interaction.options.getInteger("seconds");
        await interaction.channel.setRateLimitPerUser(seconds);
        return interaction.reply(`🐢 Slowmode set to ${seconds}s`);
      }
    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: "❌ An error occurred.",
        ephemeral: true
      }).catch(() => {});
    }
  }
};

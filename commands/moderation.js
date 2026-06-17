const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

const e = require("../emojis.js");

module.exports = {
  category: "Moderation",

  data: new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Moderation control system")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.KickMembers |
      PermissionFlagsBits.BanMembers |
      PermissionFlagsBits.ModerateMembers
    )

    // =====================
    // ACTIONS
    // =====================
    .addSubcommand(s =>
      s.setName("kick")
        .setDescription("Kick a user")
        .addUserOption(o => o.setName("target").setRequired(true))
        .addStringOption(o => o.setName("reason"))
    )
    .addSubcommand(s =>
      s.setName("ban")
        .setDescription("Ban a user")
        .addUserOption(o => o.setName("target").setRequired(true))
        .addStringOption(o => o.setName("reason"))
    )
    .addSubcommand(s =>
      s.setName("unban")
        .setDescription("Unban user by ID")
        .addStringOption(o => o.setName("id").setRequired(true))
        .addStringOption(o => o.setName("reason"))
    )
    .addSubcommand(s =>
      s.setName("timeout")
        .setDescription("Timeout a user")
        .addUserOption(o => o.setName("target").setRequired(true))
        .addIntegerOption(o => o.setName("minutes").setRequired(true))
        .addStringOption(o => o.setName("reason"))
    )
    .addSubcommand(s =>
      s.setName("lock")
        .setDescription("Lock current channel")
    )
    .addSubcommand(s =>
      s.setName("unlock")
        .setDescription("Unlock current channel")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    // =====================
    // MOD LOG HELPER
    // =====================
    const sendLog = async (action, icon, target, reason) => {
      const id = await redis.get(`modlog_channel:${guild.id}`);
      if (!id) return;

      const channel = await guild.channels.fetch(id).catch(() => null);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("🛡️ Moderation Log")
        .addFields(
          { name: "Action", value: `${icon} ${action}`, inline: false },
          { name: "Target", value: target ? `${target.tag || target.id}` : "Channel", inline: true },
          { name: "Moderator", value: interaction.user.tag, inline: true },
          { name: "Reason", value: reason || "None" }
        )
        .setTimestamp();

      channel.send({ embeds: [embed] }).catch(() => {});
    };

    // =====================
    // HIERARCHY CHECK
    // =====================
    const checkMember = async (user) => {
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return null;

      if (user.id === guild.ownerId) return "OWNER";

      if (member.roles.highest.position >= guild.members.me.roles.highest.position)
        return "BOT_LOW";

      return member;
    };

    // =====================
    // KICK
    // =====================
    if (sub === "kick") {
      const user = interaction.options.getUser("target");
      const reason = interaction.options.getString("reason") || "No reason";

      const member = await checkMember(user);

      if (!member || member === "OWNER")
        return interaction.reply({ content: "❌ Cannot kick this user", flags: [MessageFlags.Ephemeral] });

      if (member === "BOT_LOW")
        return interaction.reply({ content: "❌ My role is too low", flags: [MessageFlags.Ephemeral] });

      await member.kick(reason);

      await sendLog("Kick", "👢", user, reason);

      return interaction.reply({
        content: `👢 Kicked **${user.tag}**`
      });
    }

    // =====================
    // BAN
    // =====================
    if (sub === "ban") {
      const user = interaction.options.getUser("target");
      const reason = interaction.options.getString("reason") || "No reason";

      const member = await checkMember(user);

      if (member === "OWNER")
        return interaction.reply({ content: "❌ Cannot ban owner", flags: [MessageFlags.Ephemeral] });

      await guild.members.ban(user.id, { reason }).catch(() => {
        throw new Error("Ban failed");
      });

      await sendLog("Ban", "🔨", user, reason);

      return interaction.reply({
        content: `🔨 Banned **${user.tag}**`
      });
    }

    // =====================
    // UNBAN
    // =====================
    if (sub === "unban") {
      const id = interaction.options.getString("id");
      const reason = interaction.options.getString("reason") || "No reason";

      const banned = await guild.bans.fetch().catch(() => null);
      if (!banned?.has(id))
        return interaction.reply({ content: "❌ Not banned", flags: [MessageFlags.Ephemeral] });

      const user = await guild.members.unban(id, reason);

      await sendLog("Unban", "🔓", user, reason);

      return interaction.reply({
        content: `🔓 Unbanned **${user.tag || id}**`
      });
    }

    // =====================
    // TIMEOUT
    // =====================
    if (sub === "timeout") {
      const user = interaction.options.getUser("target");
      const minutes = interaction.options.getInteger("minutes");
      const reason = interaction.options.getString("reason") || "No reason";

      if (minutes < 1 || minutes > 40320)
        return interaction.reply({ content: "❌ Invalid duration", flags: [MessageFlags.Ephemeral] });

      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member)
        return interaction.reply({ content: "❌ User not found", flags: [MessageFlags.Ephemeral] });

      await member.timeout(minutes * 60000, reason);

      await sendLog(`Timeout ${minutes}m`, "⏳", user, reason);

      return interaction.reply({
        content: `⏳ Timed out **${user.tag}** for ${minutes}m`
      });
    }

    // =====================
    // LOCK
    // =====================
    if (sub === "lock") {
      const prev = await interaction.channel.permissionOverwrites.cache.get(guild.roles.everyone.id)?.allow?.has("SendMessages");

      await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false
      });

      await sendLog("Lock", "🔒", null, interaction.channel.name);

      return interaction.reply({
        content: "🔒 Channel locked"
      });
    }

    // =====================
    // UNLOCK
    // =====================
    if (sub === "unlock") {
      await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: null
      });

      await sendLog("Unlock", "🔓", null, interaction.channel.name);

      return interaction.reply({
        content: "🔓 Channel unlocked"
      });
    }
  }
};

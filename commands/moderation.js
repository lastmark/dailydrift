const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  category: "Moderation",
  data: new SlashCommandBuilder()
    .setName("mod")

    .setDescription("🛡️ Core server moderation control systems.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers | 
      PermissionFlagsBits.KickMembers | 
      PermissionFlagsBits.BanMembers
    )
    .addSubcommand(sub =>
      sub.setName("kick").setDescription("Kick a disruptive member from the guild.")
        .addUserOption(opt => opt.setName("target").setDescription("Select user").setRequired(true))
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for kick").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("ban").setDescription("Permanently ban a member from the guild.")
        .addUserOption(opt => opt.setName("target").setDescription("Select user").setRequired(true))
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for ban").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("unban").setDescription("Revoke a user's ban sentence via User ID.")
        .addStringOption(opt => opt.setName("id").setDescription("The unique Discord ID of the user to unban").setRequired(true))
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for unban").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("timeout").setDescription("Place a member in a temporary timeout state.")
        .addUserOption(opt => opt.setName("target").setDescription("Select user").setRequired(true))
        .addIntegerOption(opt => opt.setName("minutes").setDescription("Duration in minutes").setRequired(true))
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for timeout").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("lock").setDescription("Lock down the current text channel room.")
    )
    .addSubcommand(sub =>
      sub.setName("unlock").setDescription("Restore standard talking permissions to the current channel room.")
    ),

  async execute(interaction, client, redis) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    
    const sendModLog = async (action, icon, targetUser, reason) => {
      const logChannelId = await redis.get(`modlog_channel:${guild.id}`);
      if (!logChannelId) return;
      const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
      if (!logChannel) return;

      const logEmbed = new EmbedBuilder()
        .setColor("#FF0000")
        .setAuthor({ name: "Security Audit Log", iconURL: targetUser?.displayAvatarURL || guild.iconURL() })
        .setDescription(`${icon} **Action:** ${action}\n${e.profile || "👤"} **Target:** ${targetUser ? `${targetUser.username || targetUser} (\`${targetUser.id || targetUser}\`)` : "Channel Matrix"}\n${e.info || "ℹ️"} **Moderator:** ${interaction.user.username}\n📝 **Reason:** ${reason || "None specified"}`)
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
    };

    // ─── ROLE HIERARCHY PROTECTION GUARD ───
    if (["kick", "ban", "timeout"].includes(subcommand)) {
      const targetUser = interaction.options.getUser("target");
      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

      if (targetMember) {
        if (targetUser.id === guild.ownerId) {
          return interaction.reply({ content: `${e.error || "❌"} Target is the server owner. Execution blocked.`, flags: [MessageFlags.Ephemeral] });
        }
        if (targetMember.roles.highest.position >= guild.members.me.roles.highest.position) {
          return interaction.reply({ content: `${e.error || "❌"} Execution blocked: Target user holds equal or greater hierarchy status than the bot application.`, flags: [MessageFlags.Ephemeral] });
        }
      }
    }

    // ─── ACTION: KICK ───
    if (subcommand === "kick") {
      const target = interaction.options.getUser("target");
      const reason = interaction.options.getString("reason") || "No explicit reason logged.";
      const member = await guild.members.fetch(target.id).catch(() => null);

      if (!member || !member.kickable) return interaction.reply({ content: `${e.error || "❌"} Unable to kick this member.`, flags: [MessageFlags.Ephemeral] });
      await member.kick(reason);
      await sendModLog("KICK", e.kick, target, reason);
      return interaction.reply({ content: `${e.kick || "✅"} **${target.username}** has been kicked from the server.` });
    }

    // ─── ACTION: BAN ───
    if (subcommand === "ban") {
      const target = interaction.options.getUser("target");
      const reason = interaction.options.getString("reason") || "No explicit reason logged.";
      await guild.members.ban(target.id, { reason });
      await sendModLog("BAN", e.ban, target, reason);
      return interaction.reply({ content: `${e.ban || "✅"} **${target.username}** has been permanently banned.` });
    }

    // ─── ACTION: UNBAN ───
    if (subcommand === "unban") {
      const targetId = interaction.options.getString("id");
      const reason = interaction.options.getString("reason") || "No explicit reason logged.";

      const banList = await guild.bans.fetch().catch(() => null);
      if (banList && !banList.has(targetId)) {
        return interaction.reply({ content: `${e.error || "❌"} This user ID does not have an active ban entry on this guild.`, flags: [MessageFlags.Ephemeral] });
      }

      const unbannedUser = await guild.members.unban(targetId, reason).catch(() => null);
      if (!unbannedUser) {
        return interaction.reply({ content: `${e.error || "❌"} Failed to lift ban. Confirm that the ID format is correct.`, flags: [MessageFlags.Ephemeral] });
      }

      await sendModLog("UNBAN", e.unban, unbannedUser, reason);
      return interaction.reply({ content: `${e.unban || "✅"} Ban lifted safely for user: **${unbannedUser.username || targetId}**.` });
    }

    // ─── ACTION: TIMEOUT ───
    if (subcommand === "timeout") {
      const target = interaction.options.getUser("target");
      const minutes = interaction.options.getInteger("minutes");
      const reason = interaction.options.getString("reason") || "No explicit reason logged.";
      const member = await guild.members.fetch(target.id).catch(() => null);

      if (!member) return interaction.reply({ content: `${e.error || "❌"} Target user not found.`, flags: [MessageFlags.Ephemeral] });
      await member.timeout(minutes * 60 * 1000, reason);
      await sendModLog(`TIMEOUT (${minutes}m)`, e.lock, target, reason);
      return interaction.reply({ content: `${e.lock || "✅"} **${target.username}** has been timed out for ${minutes} minutes.` });
    }

    // ─── ACTION: LOCK ───
    if (subcommand === "lock") {
      await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      await sendModLog("CHANNEL LOCK", e.lock, null, `Channel: ${interaction.channel.name}`);
      return interaction.reply({ content: `${e.lock || "🔒"} **Channel Locked:** Standard sending permissions frozen inside this grid.` });
    }

    // ─── ACTION: UNLOCK ───
    if (subcommand === "unlock") {
      await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      await sendModLog("CHANNEL UNLOCK", e.unban, null, `Channel: ${interaction.channel.name}`);
      return interaction.reply({ content: `${e.unban || "🔓"} **Channel Unlocked:** Standard communication lines restored.` });
    }
  }
};

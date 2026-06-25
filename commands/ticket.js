// commands/ticket.js – Complete ticket system
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, MessageFlags } = require("discord.js");
const { t } = require("../utils/language.js");
const { createTranscript } = require("../utils/ticketUtils.js");

module.exports = {
  category: "Support",
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("🎫 Ticket system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub =>
      sub.setName("create")
        .setDescription("Create a new ticket")
        .addStringOption(opt =>
          opt.setName("category")
            .setDescription("Ticket category")
            .setRequired(true)
            .addChoices(
              { name: "🛠️ Support", value: "support" },
              { name: "📢 Report", value: "report" },
              { name: "💡 Suggestion", value: "suggestion" },
              { name: "❓ Other", value: "other" }
            )
        )
        .addStringOption(opt =>
          opt.setName("priority")
            .setDescription("Priority level (premium feature)")
            .setRequired(false)
            .addChoices(
              { name: "🟢 Low", value: "low" },
              { name: "🟡 Medium", value: "medium" },
              { name: "🔴 High", value: "high" }
            )
        )
        .addStringOption(opt =>
          opt.setName("subject")
            .setDescription("Brief subject of your issue")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName("close")
        .setDescription("Close a ticket")
        .addStringOption(opt =>
          opt.setName("reason")
            .setDescription("Reason for closing (optional)")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName("claim")
        .setDescription("Claim a ticket")
    )
    .addSubcommand(sub =>
      sub.setName("add")
        .setDescription("Add a user to the ticket")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User to add")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("remove")
        .setDescription("Remove a user from the ticket")
        .addUserOption(opt =>
          opt.setName("user")
            .setDescription("User to remove")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("transcript")
        .setDescription("Get the transcript of a ticket")
    )
    .addSubcommand(sub =>
      sub.setName("settings")
        .setDescription("Configure ticket settings (admin only)")
        .addChannelOption(opt =>
          opt.setName("category")
            .setDescription("Category for ticket channels")
            .addChannelTypes(ChannelType.GuildCategory)
        )
        .addChannelOption(opt =>
          opt.setName("transcript_channel")
            .setDescription("Channel to send transcripts")
            .addChannelTypes(ChannelType.GuildText)
        )
        .addRoleOption(opt =>
          opt.setName("support_role")
            .setDescription("Role that can manage tickets")
        )
        .addIntegerOption(opt =>
          opt.setName("cooldown")
            .setDescription("Cooldown between ticket creation (seconds)")
            .setMinValue(10)
            .setMaxValue(3600)
        )
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const lang = interaction.lang || "en";

    const T = (key, params) => t(lang, `ticket.${key}`, params);

    // ---- Check if user is in a ticket channel ----
    const channel = interaction.channel;
    const ticketData = await redis.get(`ticket:${guildId}:${channel.id}`);
    const isTicketChannel = !!ticketData;

    // ---- CREATE ----
    if (sub === "create") {
      // Check cooldown
      const cooldownKey = `ticket:cooldown:${guildId}:${userId}`;
      const cooldown = await redis.get(cooldownKey);
      if (cooldown) {
        const remaining = Math.ceil((Number(cooldown) - Date.now()) / 1000);
        if (remaining > 0) {
          return interaction.reply({
            content: `⏳ Please wait ${remaining} seconds before creating another ticket.`,
            flags: MessageFlags.Ephemeral
          });
        }
      }

      // Get settings
      const categoryId = await redis.get(`ticket:settings:${guildId}:category`) || null;
      const supportRoleId = await redis.get(`ticket:settings:${guildId}:support_role`) || null;
      const cooldownTime = Number(await redis.get(`ticket:settings:${guildId}:cooldown`) || 30);

      // Check if user already has an open ticket
      const existingKey = `ticket:open:${guildId}:${userId}`;
      if (await redis.get(existingKey)) {
        return interaction.reply({
          content: "❌ You already have an open ticket. Please close it first.",
          flags: MessageFlags.Ephemeral
        });
      }

      // Premium check for priority
      const isPremium = await redis.get(`premium:guild:${guildId}`) !== null;
      const priority = interaction.options.getString("priority") || "low";
      if (priority !== "low" && !isPremium) {
        return interaction.reply({
          content: "❌ Priority levels are a **Guild Premium** feature.",
          flags: MessageFlags.Ephemeral
        });
      }

      // Get category and subject
      const category = interaction.options.getString("category");
      const subject = interaction.options.getString("subject") || "No subject";

      // Create channel
      const guild = interaction.guild;
      const member = interaction.member;

      // Prepare channel name
      const channelName = `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      // Set permissions
      const permissionOverwrites = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
      ];

      // Add support role if configured
      if (supportRoleId) {
        permissionOverwrites.push({
          id: supportRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
        });
      }

      // Create channel
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites,
        topic: `Ticket for ${member.user.tag} | Category: ${category} | Priority: ${priority}`,
      });

      // Send opening message
      const embed = new EmbedBuilder()
        .setColor(priority === "high" ? "#ED4245" : priority === "medium" ? "#F1C40F" : "#57F287")
        .setTitle("🎫 Ticket Created")
        .setDescription(`Welcome ${member}, your ticket has been created.\nA staff member will assist you shortly.`)
        .addFields(
          { name: "Subject", value: subject, inline: false },
          { name: "Category", value: category, inline: true },
          { name: "Priority", value: priority.toUpperCase(), inline: true }
        )
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_claim:${ticketChannel.id}`)
            .setLabel("Claim Ticket")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`ticket_add_user:${ticketChannel.id}`)
            .setLabel("Add User")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`ticket_close:${ticketChannel.id}`)
            .setLabel("Close Ticket")
            .setStyle(ButtonStyle.Danger)
        );

      await ticketChannel.send({ embeds: [embed], components: [row] });

      // Save ticket data
      const ticketId = `ticket:${guildId}:${ticketChannel.id}`;
      await redis.hset(ticketId, {
        creator: userId,
        category: category,
        priority: priority,
        subject: subject,
        claimedBy: "",
        createdAt: Date.now(),
        closedAt: "",
        transcript: "",
      });
      await redis.set(`ticket:open:${guildId}:${userId}`, ticketChannel.id);
      await redis.setex(`ticket:cooldown:${guildId}:${userId}`, cooldownTime, Date.now() + cooldownTime * 1000);

      return interaction.reply({
        content: `✅ Ticket created: ${ticketChannel}`,
        flags: MessageFlags.Ephemeral
      });
    }

    // ---- CLOSE ----
    if (sub === "close") {
      if (!isTicketChannel) {
        return interaction.reply({
          content: "❌ This is not a ticket channel.",
          flags: MessageFlags.Ephemeral
        });
      }

      const data = JSON.parse(ticketData);
      if (data.creator !== userId && !interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          content: "❌ You don't have permission to close this ticket.",
          flags: MessageFlags.Ephemeral
        });
      }

      const reason = interaction.options.getString("reason") || "No reason provided";

      // Generate transcript
      const transcript = await createTranscript(channel, client);
      const transcriptChannelId = await redis.get(`ticket:settings:${guildId}:transcript_channel`);
      if (transcriptChannelId) {
        const transcriptChannel = interaction.guild.channels.cache.get(transcriptChannelId);
        if (transcriptChannel) {
          await transcriptChannel.send({
            content: `📜 Transcript for ticket ${channel.name}`,
            files: [{ attachment: Buffer.from(transcript, 'utf-8'), name: `transcript-${channel.name}.txt` }]
          });
        }
      }

      // Update data
      await redis.hset(`ticket:${guildId}:${channel.id}`, {
        ...data,
        closedAt: Date.now(),
        transcript: transcript
      });
      await redis.del(`ticket:open:${guildId}:${data.creator}`);
      await redis.set(`ticket:closed:${guildId}:${channel.id}`, JSON.stringify(data));

      // Send closure message
      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("📪 Ticket Closed")
        .setDescription(`This ticket has been closed by ${interaction.user}.\nReason: ${reason}`)
        .setTimestamp();

      await channel.send({ embeds: [embed] });

      // Delete channel after 5 seconds (optional)
      setTimeout(async () => {
        await channel.delete().catch(() => {});
      }, 5000);

      return interaction.reply({
        content: `✅ Ticket closed. Channel will be deleted shortly.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // ---- CLAIM ----
    if (sub === "claim") {
      if (!isTicketChannel) {
        return interaction.reply({
          content: "❌ This is not a ticket channel.",
          flags: MessageFlags.Ephemeral
        });
      }

      const data = JSON.parse(ticketData);
      if (data.claimedBy) {
        return interaction.reply({
          content: `❌ This ticket is already claimed by <@${data.claimedBy}>.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Check if user has support role or manage channels
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
        const supportRoleId = await redis.get(`ticket:settings:${guildId}:support_role`);
        if (!supportRoleId || !interaction.member.roles.cache.has(supportRoleId)) {
          return interaction.reply({
            content: "❌ You don't have permission to claim tickets.",
            flags: MessageFlags.Ephemeral
          });
        }
      }

      await redis.hset(`ticket:${guildId}:${channel.id}`, { ...data, claimedBy: userId });
      await channel.send(`✅ ${interaction.user} has claimed this ticket.`);

      return interaction.reply({
        content: "✅ Ticket claimed!",
        flags: MessageFlags.Ephemeral
      });
    }

    // ---- ADD USER ----
    if (sub === "add") {
      if (!isTicketChannel) {
        return interaction.reply({
          content: "❌ This is not a ticket channel.",
          flags: MessageFlags.Ephemeral
        });
      }

      const targetUser = interaction.options.getUser("user");
      await channel.permissionOverwrites.create(targetUser, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });

      return interaction.reply({
        content: `✅ Added ${targetUser} to the ticket.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // ---- REMOVE USER ----
    if (sub === "remove") {
      if (!isTicketChannel) {
        return interaction.reply({
          content: "❌ This is not a ticket channel.",
          flags: MessageFlags.Ephemeral
        });
      }

      const targetUser = interaction.options.getUser("user");
      const data = JSON.parse(ticketData);
      if (targetUser.id === data.creator) {
        return interaction.reply({
          content: "❌ You cannot remove the ticket creator.",
          flags: MessageFlags.Ephemeral
        });
      }

      await channel.permissionOverwrites.delete(targetUser);

      return interaction.reply({
        content: `✅ Removed ${targetUser} from the ticket.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // ---- TRANSCRIPT ----
    if (sub === "transcript") {
      if (!isTicketChannel) {
        return interaction.reply({
          content: "❌ This is not a ticket channel.",
          flags: MessageFlags.Ephemeral
        });
      }

      const data = JSON.parse(ticketData);
      if (!data.transcript) {
        return interaction.reply({
          content: "❌ No transcript available for this ticket.",
          flags: MessageFlags.Ephemeral
        });
      }

      return interaction.reply({
        content: "📜 Transcript:",
        files: [{ attachment: Buffer.from(data.transcript, 'utf-8'), name: `transcript-${channel.name}.txt` }],
        flags: MessageFlags.Ephemeral
      });
    }

    // ---- SETTINGS ----
    if (sub === "settings") {
      // Check admin
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: "❌ You need Administrator permission.",
          flags: MessageFlags.Ephemeral
        });
      }

      const category = interaction.options.getChannel("category");
      const transcriptChannel = interaction.options.getChannel("transcript_channel");
      const supportRole = interaction.options.getRole("support_role");
      const cooldown = interaction.options.getInteger("cooldown");

      if (category) await redis.set(`ticket:settings:${guildId}:category`, category.id);
      if (transcriptChannel) await redis.set(`ticket:settings:${guildId}:transcript_channel`, transcriptChannel.id);
      if (supportRole) await redis.set(`ticket:settings:${guildId}:support_role`, supportRole.id);
      if (cooldown) await redis.set(`ticket:settings:${guildId}:cooldown`, cooldown);

      return interaction.reply({
        content: "✅ Ticket settings updated!",
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

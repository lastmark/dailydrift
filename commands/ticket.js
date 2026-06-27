// commands/ticket.js – Ultimate Button-Based Ticket System
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags
} = require("discord.js");

// ----------------------------------------------------------------------
//  HELPER: createTicket
//  Used by /ticket create AND the panel button handler in index.js
// ----------------------------------------------------------------------
async function createTicket(interaction, client, redis, userId, category = "support") {
  const guild = interaction.guild;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) throw new Error("Member not found.");

  const guildId = guild.id;

  // Check if user already has an open ticket
  const openTicketKey = `ticket:open:${guildId}:${userId}`;
  if (await redis.get(openTicketKey)) {
    return interaction.reply({
      content: "❌ You already have an open ticket.",
      flags: MessageFlags.Ephemeral
    });
  }

  // Fetch settings
  const supportRoleId = await redis.get(`ticket:settings:${guildId}:support_role`);
  const categoryId = await redis.get(`ticket:settings:${guildId}:category`);

  // Build channel name
  const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const channelName = `ticket-${safeName}`;

  // Permission overwrites
  const permissionOverwrites = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];

  if (supportRoleId) {
    permissionOverwrites.push({
      id: supportRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
    });
  }

  // Create the channel
  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId || null,
    permissionOverwrites,
    topic: `Ticket for ${member.user.tag} | Category: ${category}`,
  }).catch(err => {
    console.error("Failed to create ticket channel:", err);
    return null;
  });

  if (!ticketChannel) {
    return interaction.reply({
      content: "❌ Could not create the ticket channel.",
      flags: MessageFlags.Ephemeral
    });
  }

  // Opening embed
  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("🎫 Ticket Created")
    .setDescription(`Welcome ${member}, your ticket has been created.\nA staff member will assist you shortly.`)
    .addFields(
      { name: "Category", value: category, inline: true },
      { name: "Created by", value: `${member.user.tag}`, inline: true }
    )
    .setTimestamp();

  // Action buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_claim:${ticketChannel.id}`)
      .setLabel("Claim")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_add_user:${ticketChannel.id}`)
      .setLabel("Add User")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_close:${ticketChannel.id}`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger),
  );

  await ticketChannel.send({ embeds: [embed], components: [row] });

  // Save ticket data
  const ticketData = {
    creator: userId,
    category: category,
    claimedBy: "",
    createdAt: Date.now(),
    closedAt: null,
    transcript: "",
  };

  await redis.hset(`ticket:${guildId}:${ticketChannel.id}`, ticketData);
  await redis.set(openTicketKey, ticketChannel.id);

  // Try to reply to the interaction that initiated creation
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({
      content: `✅ Ticket created: ${ticketChannel}`,
      flags: MessageFlags.Ephemeral
    });
  } else {
    await interaction.reply({
      content: `✅ Ticket created: ${ticketChannel}`,
      flags: MessageFlags.Ephemeral
    });
  }

  return ticketChannel;
}

// ----------------------------------------------------------------------
//  HELPER: generateTranscript
// ----------------------------------------------------------------------
async function generateTranscript(channel) {
  const messages = [];
  let lastId;
  while (true) {
    const fetched = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => []);
    if (fetched.size === 0) break;
    messages.push(...fetched.values());
    lastId = fetched.last().id;
  }
  messages.reverse();

  let transcript = `Transcript for ${channel.name}\n`;
  transcript += `Created: ${new Date(channel.createdTimestamp).toUTCString()}\n\n`;
  for (const msg of messages) {
    transcript += `[${msg.createdAt.toISOString()}] ${msg.author.tag}: ${msg.content}\n`;
  }
  return transcript;
}

// ======================================================================
//  MAIN COMMAND MODULE
// ======================================================================
module.exports = {
  category: "Support",
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("🎫 Manage the ticket system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub =>
      sub.setName("panel")
        .setDescription("Send the ticket creation panel to a channel")
        .addStringOption(opt => opt.setName("title").setDescription("Title of the panel embed"))
        .addStringOption(opt => opt.setName("description").setDescription("Description of the panel embed"))
        .addChannelOption(opt =>
          opt.setName("channel")
            .setDescription("Channel to send the panel to (default: current channel)")
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub.setName("create")
        .setDescription("Manually create a ticket for yourself")
        .addStringOption(opt =>
          opt.setName("category")
            .setDescription("Ticket category")
            .addChoices(
              { name: "Support", value: "support" },
              { name: "Report", value: "report" },
              { name: "Other", value: "other" }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("close")
        .setDescription("Close the current ticket (must be in a ticket channel)")
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for closing"))
    )
    .addSubcommand(sub =>
      sub.setName("claim")
        .setDescription("Claim the current ticket")
    )
    .addSubcommand(sub =>
      sub.setName("add")
        .setDescription("Add a user to this ticket")
        .addUserOption(opt => opt.setName("user").setDescription("User to add").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("remove")
        .setDescription("Remove a user from this ticket")
        .addUserOption(opt => opt.setName("user").setDescription("User to remove").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("settings")
        .setDescription("Configure ticket system settings")
        .addChannelOption(opt => opt.setName("category").setDescription("Category for ticket channels").addChannelTypes(ChannelType.GuildCategory))
        .addChannelOption(opt => opt.setName("transcript_channel").setDescription("Channel for closed transcripts").addChannelTypes(ChannelType.GuildText))
        .addRoleOption(opt => opt.setName("support_role").setDescription("Role that can manage tickets"))
        .addChannelOption(opt => opt.setName("panel_channel").setDescription("Channel for the ticket panel").addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(sub =>
      sub.setName("transcript")
        .setDescription("View transcript of a closed ticket")
        .addStringOption(opt =>
          opt.setName("ticket_id")
            .setDescription("Channel ID of the closed ticket")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("reopen")
        .setDescription("Reopen a recently closed ticket (must be in the closed channel or provide ID)")
        .addStringOption(opt =>
          opt.setName("channel_id")
            .setDescription("ID of the closed ticket channel")
            .setRequired(false)
        )
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // ======================= PANEL =======================
    if (sub === "panel") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Administrator permission required.", flags: MessageFlags.Ephemeral });
      }

      const title = interaction.options.getString("title") || "🎫 Create a Ticket";
      const description = interaction.options.getString("description") || "Click the button below to open a ticket. Our staff will respond as soon as possible.";
      const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: "Ticket System" })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_create_panel")
          .setLabel("Open Ticket")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🎫")
      );

      await targetChannel.send({ embeds: [embed], components: [row] });

      // Save the panel message ID for potential later use
      // (We don't need it for button handling, but can be used to disable the panel etc.)
      await redis.set(`ticket:panel:${guildId}`, targetChannel.id);

      return interaction.reply({
        content: `✅ Ticket panel sent to ${targetChannel}`,
        flags: MessageFlags.Ephemeral
      });
    }

    // ======================= CREATE =======================
    if (sub === "create") {
      const category = interaction.options.getString("category") || "support";
      await createTicket(interaction, client, redis, userId, category);
      return;
    }

    // ======================= CLOSE =======================
    if (sub === "close") {
      const channel = interaction.channel;
      const ticketKey = `ticket:${guildId}:${channel.id}`;
      const ticketData = await redis.hgetall(ticketKey);
      if (!ticketData || !ticketData.creator) {
        return interaction.reply({ content: "❌ This is not a ticket channel.", flags: MessageFlags.Ephemeral });
      }

      const isCreator = ticketData.creator === userId;
      const isClaimedBy = ticketData.claimedBy === userId;
      const hasPerm = interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels);
      if (!isCreator && !isClaimedBy && !hasPerm) {
        return interaction.reply({ content: "❌ You cannot close this ticket.", flags: MessageFlags.Ephemeral });
      }

      const reason = interaction.options.getString("reason") || "No reason provided";

      // Generate transcript
      const transcript = await generateTranscript(channel);
      const transcriptChannelId = await redis.get(`ticket:settings:${guildId}:transcript_channel`);
      if (transcriptChannelId) {
        const tChannel = interaction.guild.channels.cache.get(transcriptChannelId);
        if (tChannel) {
          await tChannel.send({
            content: `📜 Transcript for ticket <#${channel.id}> closed by ${interaction.user.tag}`,
            files: [{ attachment: Buffer.from(transcript, "utf-8"), name: `transcript-${channel.name}.txt` }],
          });
        }
      }

      // Update ticket data
      await redis.hset(ticketKey, {
        closedAt: Date.now().toString(),
        transcript: transcript,
        closedBy: userId,
        reason: reason,
      });
      await redis.del(`ticket:open:${guildId}:${ticketData.creator}`);
      await redis.set(`ticket:closed:${guildId}:${channel.id}`, ticketKey); // mark as closed

      // Send closure embed
      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("📪 Ticket Closed")
        .setDescription(`Closed by ${interaction.user}\nReason: ${reason}`)
        .setTimestamp();
      await channel.send({ embeds: [embed] });

      // Delete after 5 seconds
      setTimeout(() => channel.delete().catch(() => {}), 5000);

      return interaction.reply({ content: "✅ Ticket closed.", flags: MessageFlags.Ephemeral });
    }

    // ======================= CLAIM =======================
    if (sub === "claim") {
      const channel = interaction.channel;
      const ticketKey = `ticket:${guildId}:${channel.id}`;
      const ticketData = await redis.hgetall(ticketKey);
      if (!ticketData || !ticketData.creator) {
        return interaction.reply({ content: "❌ Not a ticket channel.", flags: MessageFlags.Ephemeral });
      }

      if (ticketData.claimedBy && ticketData.claimedBy !== "") {
        return interaction.reply({ content: `❌ Already claimed by <@${ticketData.claimedBy}>.`, flags: MessageFlags.Ephemeral });
      }

      const supportRoleId = await redis.get(`ticket:settings:${guildId}:support_role`);
      const hasPerm = interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels) ||
                      (supportRoleId && interaction.member.roles.cache.has(supportRoleId));
      if (!hasPerm) {
        return interaction.reply({ content: "❌ You lack permission to claim.", flags: MessageFlags.Ephemeral });
      }

      await redis.hset(ticketKey, "claimedBy", userId);
      await channel.send(`✅ Ticket claimed by ${interaction.user}.`);
      return interaction.reply({ content: "✅ Ticket claimed.", flags: MessageFlags.Ephemeral });
    }

    // ======================= ADD USER =======================
    if (sub === "add") {
      const channel = interaction.channel;
      const ticketKey = `ticket:${guildId}:${channel.id}`;
      const ticketData = await redis.hgetall(ticketKey);
      if (!ticketData || !ticketData.creator) {
        return interaction.reply({ content: "❌ Not a ticket channel.", flags: MessageFlags.Ephemeral });
      }

      const targetUser = interaction.options.getUser("user");
      await channel.permissionOverwrites.create(targetUser, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      return interaction.reply({
        content: `✅ Added ${targetUser} to this ticket.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // ======================= REMOVE USER =======================
    if (sub === "remove") {
      const channel = interaction.channel;
      const ticketKey = `ticket:${guildId}:${channel.id}`;
      const ticketData = await redis.hgetall(ticketKey);
      if (!ticketData || !ticketData.creator) {
        return interaction.reply({ content: "❌ Not a ticket channel.", flags: MessageFlags.Ephemeral });
      }

      const targetUser = interaction.options.getUser("user");
      if (targetUser.id === ticketData.creator) {
        return interaction.reply({ content: "❌ Cannot remove the ticket creator.", flags: MessageFlags.Ephemeral });
      }

      await channel.permissionOverwrites.delete(targetUser);
      return interaction.reply({ content: `✅ Removed ${targetUser}.`, flags: MessageFlags.Ephemeral });
    }

    // ======================= SETTINGS =======================
    if (sub === "settings") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Administrator required.", flags: MessageFlags.Ephemeral });
      }

      const category = interaction.options.getChannel("category");
      const transcriptChannel = interaction.options.getChannel("transcript_channel");
      const supportRole = interaction.options.getRole("support_role");
      const panelChannel = interaction.options.getChannel("panel_channel");

      if (category) await redis.set(`ticket:settings:${guildId}:category`, category.id);
      if (transcriptChannel) await redis.set(`ticket:settings:${guildId}:transcript_channel`, transcriptChannel.id);
      if (supportRole) await redis.set(`ticket:settings:${guildId}:support_role`, supportRole.id);
      if (panelChannel) await redis.set(`ticket:settings:${guildId}:panel_channel`, panelChannel.id);

      return interaction.reply({ content: "✅ Ticket settings updated.", flags: MessageFlags.Ephemeral });
    }

    // ======================= TRANSCRIPT =======================
    if (sub === "transcript") {
      const ticketChannelId = interaction.options.getString("ticket_id");
      const closedKey = `ticket:${guildId}:${ticketChannelId}`;
      const ticketData = await redis.hgetall(closedKey);
      if (!ticketData || !ticketData.transcript) {
        return interaction.reply({ content: "❌ Transcript not found for that ticket.", flags: MessageFlags.Ephemeral });
      }

      return interaction.reply({
        content: `📜 Transcript for <#${ticketChannelId}>:`,
        files: [{ attachment: Buffer.from(ticketData.transcript, "utf-8"), name: `transcript-${ticketChannelId}.txt` }],
        flags: MessageFlags.Ephemeral
      });
    }

    // ======================= REOPEN =======================
    if (sub === "reopen") {
      const channelId = interaction.options.getString("channel_id") || interaction.channel.id;
      const closedKey = `ticket:closed:${guildId}:${channelId}`;
      const ticketKey = await redis.get(closedKey);
      if (!ticketKey) {
        return interaction.reply({ content: "❌ No closed ticket found with that ID.", flags: MessageFlags.Ephemeral });
      }

      const ticketData = await redis.hgetall(ticketKey);
      if (!ticketData || !ticketData.creator) {
        return interaction.reply({ content: "❌ Invalid ticket data.", flags: MessageFlags.Ephemeral });
      }

      // Remove closed flag, re-add open key
      await redis.del(closedKey);
      await redis.hdel(ticketKey, "closedAt");
      await redis.hdel(ticketKey, "transcript");
      await redis.hdel(ticketKey, "closedBy");
      await redis.hdel(ticketKey, "reason");
      await redis.set(`ticket:open:${guildId}:${ticketData.creator}`, channelId);

      // Re-add permissions (the channel still exists, we just need to adjust)
      const channel = interaction.guild.channels.cache.get(channelId);
      if (channel) {
        await channel.permissionOverwrites.edit(ticketData.creator, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
      }

      return interaction.reply({ content: `✅ Ticket <#${channelId}> has been reopened.`, flags: MessageFlags.Ephemeral });
    }
  },
  // Export the helper for use in index.js
  createTicket
};

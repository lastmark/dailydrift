// commands/ticket.js – Complete ticket system with reaction panel
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, MessageFlags } = require("discord.js");
const { createTranscript } = require("../utils/ticketUtils.js");

module.exports = {
  category: "Support",
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("🎫 Ticket system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub =>
      sub.setName("panel")
        .setDescription("Send the ticket creation panel")
        .addStringOption(opt =>
          opt.setName("title")
            .setDescription("Title of the panel")
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName("description")
            .setDescription("Description of the panel")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName("create")
        .setDescription("Create a ticket (for testing)")
        .addStringOption(opt =>
          opt.setName("category")
            .setDescription("Category")
            .setRequired(false)
            .addChoices(
              { name: "Support", value: "support" },
              { name: "Report", value: "report" },
              { name: "Other", value: "other" }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("close")
        .setDescription("Close the current ticket")
        .addStringOption(opt =>
          opt.setName("reason")
            .setDescription("Reason for closing")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName("claim")
        .setDescription("Claim the current ticket")
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
      sub.setName("settings")
        .setDescription("Configure ticket settings")
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
        .addChannelOption(opt =>
          opt.setName("panel_channel")
            .setDescription("Channel to send the ticket panel")
            .addChannelTypes(ChannelType.GuildText)
        )
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const channel = interaction.channel;

    // ---- PANEL ----
    if (sub === "panel") {
      // Check admin
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ You need Administrator permission.", flags: MessageFlags.Ephemeral });
      }

      const title = interaction.options.getString("title") || "🎫 Create a Ticket";
      const description = interaction.options.getString("description") || "Click the 🎫 reaction below to create a ticket. A staff member will assist you shortly.";

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: "React with 🎫 to create a ticket" })
        .setTimestamp();

      const msg = await interaction.channel.send({ embeds: [embed] });
      await msg.react("🎫");

      // Save panel message ID to Redis so we can handle reactions
      await redis.set(`ticket:panel:${guildId}`, msg.id);

      return interaction.reply({
        content: `✅ Ticket panel sent in ${interaction.channel}`,
        flags: MessageFlags.Ephemeral
      });
    }

    // ---- CREATE (manual) ----
    if (sub === "create") {
      // Check if user already has an open ticket
      const existingKey = `ticket:open:${guildId}:${userId}`;
      if (await redis.get(existingKey)) {
        return interaction.reply({
          content: "❌ You already have an open ticket. Please close it first.",
          flags: MessageFlags.Ephemeral
        });
      }

      const category = interaction.options.getString("category") || "support";
      await createTicket(interaction, client, redis, userId, category);
      return;
    }

    // ---- CLOSE ----
    if (sub === "close") {
      const ticketData = await redis.get(`ticket:${guildId}:${channel.id}`);
      if (!ticketData) {
        return interaction.reply({
          content: "❌ This is not a ticket channel.",
          flags: MessageFlags.Ephemeral
        });
      }

      const data = JSON.parse(ticketData);
      // Allow only creator, claimed user, or admin
      const isAuthorized = data.creator === userId || data.claimedBy === userId || interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels);
      if (!isAuthorized) {
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
            content: `📜 Transcript for ${channel.name}`,
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

      // Delete channel after 5 seconds
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
      const ticketData = await redis.get(`ticket:${guildId}:${channel.id}`);
      if (!ticketData) {
        return interaction.reply({
          content: "❌ This is not a ticket channel.",
          flags: MessageFlags.Ephemeral
        });
      }

      const data = JSON.parse(ticketData);
      if (data.claimedBy) {
        return interaction.reply({
          content: `❌ Already claimed by <@${data.claimedBy}>.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Check permission
      const supportRoleId = await redis.get(`ticket:settings:${guildId}:support_role`);
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels) &&
          (!supportRoleId || !interaction.member.roles.cache.has(supportRoleId))) {
        return interaction.reply({
          content: "❌ You don't have permission to claim.",
          flags: MessageFlags.Ephemeral
        });
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
      const ticketData = await redis.get(`ticket:${guildId}:${channel.id}`);
      if (!ticketData) {
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
      const ticketData = await redis.get(`ticket:${guildId}:${channel.id}`);
      if (!ticketData) {
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

    // ---- SETTINGS ----
    if (sub === "settings") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: "❌ You need Administrator permission.",
          flags: MessageFlags.Ephemeral
        });
      }

      const category = interaction.options.getChannel("category");
      const transcriptChannel = interaction.options.getChannel("transcript_channel");
      const supportRole = interaction.options.getRole("support_role");
      const panelChannel = interaction.options.getChannel("panel_channel");

      if (category) await redis.set(`ticket:settings:${guildId}:category`, category.id);
      if (transcriptChannel) await redis.set(`ticket:settings:${guildId}:transcript_channel`, transcriptChannel.id);
      if (supportRole) await redis.set(`ticket:settings:${guildId}:support_role`, supportRole.id);
      if (panelChannel) await redis.set(`ticket:settings:${guildId}:panel_channel`, panelChannel.id);

      return interaction.reply({
        content: "✅ Ticket settings updated!",
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

// ---------- Helper: createTicket ----------
async function createTicket(interaction, client, redis, userId, category) {
  const guild = interaction.guild;
  const member = await guild.members.fetch(userId);
  const guildId = guild.id;

  const supportRoleId = await redis.get(`ticket:settings:${guildId}:support_role`);
  const categoryId = await redis.get(`ticket:settings:${guildId}:category`);

  // Create channel
  const channelName = `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
  ];

  if (supportRoleId) {
    permissionOverwrites.push({
      id: supportRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
    });
  }

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites,
    topic: `Ticket for ${member.user.tag} | Category: ${category}`,
  });

  // Send opening message
  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("🎫 Ticket Created")
    .setDescription(`Welcome ${member}, your ticket has been created.\nA staff member will assist you shortly.`)
    .addFields(
      { name: "Category", value: category, inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
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
        .setStyle(ButtonStyle.Danger)
    );

  await ticketChannel.send({ embeds: [embed], components: [row] });

  // Save data
  const ticketId = `ticket:${guildId}:${ticketChannel.id}`;
  await redis.hset(ticketId, {
    creator: userId,
    category: category,
    claimedBy: "",
    createdAt: Date.now(),
    closedAt: "",
    transcript: "",
  });
  await redis.set(`ticket:open:${guildId}:${userId}`, ticketChannel.id);

  return ticketChannel;
}

module.exports.createTicket = createTicket;

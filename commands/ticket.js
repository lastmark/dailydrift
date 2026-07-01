// commands/ticket.js – Premium Ticket Management System (MongoDB Optimized)
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
// ----------------------------------------------------------------------
async function createTicket(interaction, client, db, userId, category = "support") {
  const guild = interaction.guild;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) throw new Error("Member not found.");

  const guildId = guild.id;
  const openTicketKey = `ticket:open:${guildId}:${userId}`;

  const existingChannelId = await db.get(openTicketKey);
  if (existingChannelId) {
    const existingChannel = guild.channels.cache.get(existingChannelId);
    if (existingChannel) {
      return interaction.reply({ content: "❌ You already have an open ticket.", flags: MessageFlags.Ephemeral });
    } else {
      await db.del(openTicketKey);
      await db.del(`ticket:${guildId}:${existingChannelId}`);
    }
  }

  const supportRoleId = await db.get(`ticket:settings:${guildId}:support_role`);
  const categoryId = await db.get(`ticket:settings:${guildId}:category`);

  const channelName = `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
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

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId || null,
    permissionOverwrites,
    topic: `Ticket for ${member.user.tag} | Category: ${category}`,
  }).catch(() => null);

  if (!ticketChannel) return interaction.reply({ content: "❌ Could not create channel.", flags: MessageFlags.Ephemeral });

  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("🎫 Ticket Created")
    .setDescription(`Welcome ${member}, a staff member will assist you shortly.`)
    .addFields({ name: "Category", value: category, inline: true }, { name: "Creator", value: `${member.user.tag}`, inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_claim:${ticketChannel.id}`).setLabel("Claim").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket_close:${ticketChannel.id}`).setLabel("Close").setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({ embeds: [embed], components: [row] });

  // Atomic database set for ticket
  await db.set(`ticket:${guildId}:${ticketChannel.id}`, {
    creator: userId,
    category,
    claimedBy: "",
    createdAt: Date.now()
  });
  await db.set(openTicketKey, ticketChannel.id);

  const reply = { content: `✅ Ticket created: ${ticketChannel}`, flags: MessageFlags.Ephemeral };
  interaction.replied ? await interaction.followUp(reply) : await interaction.reply(reply);
  return ticketChannel;
}

// ----------------------------------------------------------------------
//  HELPER: generateTranscript
// ----------------------------------------------------------------------
async function generateTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  return messages.map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).reverse().join("\n");
}

// ======================================================================
//  MAIN MODULE
// ======================================================================
module.exports = {
  category: "Server Management",
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("🎫 Ticket system management")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub => sub.setName("panel").setDescription("Deploy ticket panel")
      .addStringOption(o => o.setName("title").setDescription("Embed title"))
      .addChannelOption(o => o.setName("channel").addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sub => sub.setName("create").setDescription("Manually open ticket")
      .addStringOption(o => o.setName("category").addChoices({name: "Support", value: "support"}, {name: "Report", value: "report"})))
    .addSubcommand(sub => sub.setName("close").setDescription("Close current ticket"))
    .addSubcommand(sub => sub.setName("settings").setDescription("Configure settings")
      .addChannelOption(o => o.setName("category").addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o => o.setName("support_role").setDescription("Support role")))
    .addSubcommand(sub => sub.setName("transcript").setDescription("Retrieve closed transcript")
    .addStringOption(o => o.setName("ticket_id").setDescription("Ticket channel ID").setRequired(true))),

  async execute(interaction, client, db) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === "panel") {
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      const embed = new EmbedBuilder().setColor("#0A0A0A").setTitle(interaction.options.getString("title") || "Support Hub").setDescription("Click below to open a ticket.");
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket_create_panel").setLabel("Open Ticket").setStyle(ButtonStyle.Primary));
      await channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: "✅ Panel deployed.", flags: MessageFlags.Ephemeral });
    }

    if (sub === "create") {
      await createTicket(interaction, client, db, interaction.user.id, interaction.options.getString("category") || "support");
      return;
    }

    if (sub === "close") {
      const data = await db.get(`ticket:${guildId}:${interaction.channel.id}`);
      if (!data) return interaction.reply({ content: "❌ Not a ticket channel.", flags: MessageFlags.Ephemeral });
      
      const transcript = await generateTranscript(interaction.channel);
      await db.set(`ticket:closed:${interaction.channel.id}`, { transcript, closedAt: Date.now() });
      await db.del(`ticket:open:${guildId}:${data.creator}`);
      
      await interaction.reply({ content: "✅ Closing channel in 5 seconds..." });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
    
    if (sub === "settings") {
      const category = interaction.options.getChannel("category");
      const role = interaction.options.getRole("support_role");
      if (category) await db.set(`ticket:settings:${guildId}:category`, category.id);
      if (role) await db.set(`ticket:settings:${guildId}:support_role`, role.id);
      return interaction.reply({ content: "✅ Settings saved to database.", flags: MessageFlags.Ephemeral });
    }
  },
  createTicket
};

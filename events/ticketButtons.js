// events/ticketButtons.js
const { Events } = require("discord.js");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client, redis) {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (!customId.startsWith("ticket_")) return;

    const [action, channelId] = customId.split(':');
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) return interaction.reply({ content: "❌ Ticket channel not found.", ephemeral: true });

    const ticketData = await redis.get(`ticket:${interaction.guild.id}:${channelId}`);
    if (!ticketData) return interaction.reply({ content: "❌ Invalid ticket.", ephemeral: true });

    const data = JSON.parse(ticketData);

    // ---- CLAIM ----
    if (action === "ticket_claim") {
      if (data.claimedBy) {
        return interaction.reply({ content: `❌ Already claimed by <@${data.claimedBy}>.`, ephemeral: true });
      }
      // Check permission
      const supportRoleId = await redis.get(`ticket:settings:${interaction.guild.id}:support_role`);
      if (supportRoleId && !interaction.member.roles.cache.has(supportRoleId)) {
        return interaction.reply({ content: "❌ You don't have permission to claim.", ephemeral: true });
      }
      await redis.hset(`ticket:${interaction.guild.id}:${channelId}`, { ...data, claimedBy: interaction.user.id });
      await channel.send(`✅ ${interaction.user} has claimed this ticket.`);
      await interaction.reply({ content: "✅ Ticket claimed!", ephemeral: true });
      return;
    }

    // ---- ADD USER (modal) ----
    if (action === "ticket_add_user") {
      // For simplicity, we'll just prompt them to use /ticket add
      return interaction.reply({
        content: "Use `/ticket add @user` to add someone.",
        ephemeral: true
      });
    }

    // ---- CLOSE ----
    if (action === "ticket_close") {
      // Trigger close process
      return interaction.reply({
        content: "Use `/ticket close` in the ticket channel.",
        ephemeral: true
      });
    }
  }
};

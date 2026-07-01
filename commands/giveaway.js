// commands/giveaway.js – Multi-layered Giveaway Management Engine
const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const ms = require("ms");

module.exports = {
  category: "Server Management",
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Start or manage server giveaways")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub.setName("start")
        .setDescription("Start a new giveaway")
        .addStringOption(opt => opt.setName("duration").setDescription("Time format (e.g., 1h, 30m, 1d)").setRequired(true))
        .addIntegerOption(opt => opt.setName("winners").setDescription("Number of winners").setRequired(true))
        .addStringOption(opt => opt.setName("prize").setDescription("The prize for the giveaway").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("end")
        .setDescription("Force end an active giveaway")
        .addStringOption(opt => opt.setName("message_id").setDescription("The giveaway message ID").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("reroll")
        .setDescription("Reroll winners from a finished giveaway")
        .addStringOption(opt => opt.setName("message_id").setDescription("The giveaway message ID").setRequired(true))
    ),

  async execute(interaction, client, db) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ─── SUBCOMMAND: START ───
    if (sub === "start") {
      const durationStr = interaction.options.getString("duration");
      const winnerCount = interaction.options.getInteger("winners");
      const prize = interaction.options.getString("prize");

      let durationMs;
      try {
        durationMs = ms(durationStr);
        if (!durationMs || isNaN(durationMs)) throw new Error();
      } catch {
        const errorEmbed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Invalid Parameter:** Use standard execution increments like `30m`, `2h`, or `1d`.");
        return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }

      const endTimestamp = Math.floor((Date.now() + durationMs) / 1000);

      const giveawayEmbed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium dark minimalist styling layout
        .setTitle(`🎁 GIVEAWAY: ${prize.toUpperCase()}`)
        .setDescription(
          `**A new giveaway pool has been deployed.**\n` +
          `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
          `• **Prize:** \`${prize}\`\n` +
          `• **Target Allocations:** \`${winnerCount} ${winnerCount === 1 ? 'Winner' : 'Winners'}\`\n` +
          `• **Expiration:** <t:${endTimestamp}:R> (<t:${endTimestamp}:f>)\n` +
          `• **Authorized By:** ${interaction.user}\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
          `*Interact via the connection node button below to join the entry list.*`
        )
        .setFooter({ text: `ACTIVE • 0 ENTRIES LOGGED` })
        .setTimestamp();

      const joinButton = new ButtonBuilder()
        .setCustomId("giveaway_join")
        .setLabel("ENTER ENTRY POOL")
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder().addComponents(joinButton);
      const msg = await interaction.reply({ embeds: [giveawayEmbed], components: [row], fetchReply: true });

      const dataPayload = {
        messageId: msg.id,
        channelId: interaction.channel.id,
        guildId: guildId,
        prize: prize,
        winners: winnerCount,
        endsAt: Date.now() + durationMs,
        ended: false,
        entries: [] // Initialize dynamic pool matrix array directly inside object tracking
      };

      await db.set(`giveaway:${msg.id}`, dataPayload);
      return;
    }

    // ─── SUBCOMMAND: END ───
    if (sub === "end") {
      const msgId = interaction.options.getString("message_id");
      const data = await db.get(`giveaway:${msgId}`);

      if (!data) {
        const errEmbed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Registry Missing:** No active giveaway mapped under that message identifier.");
        return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      if (data.ended === true) {
        const errEmbed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Pipeline Offline:** This giveaway allocation pool has already finished processing.");
        return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      // Fast-forward timestamp array parameter to immediately execute background tasks
      data.endsAt = Date.now();
      await db.set(`giveaway:${msgId}`, data); 

      const successEmbed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setDescription("⚡ **Termination Signal Sent:** Halting giveaway cycle loop. Finalizing collection array stand-by.");
      return interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
    }

    // ─── SUBCOMMAND: REROLL ───
    if (sub === "reroll") {
      const msgId = interaction.options.getString("message_id");
      const data = await db.get(`giveaway:${msgId}`);

      if (!data) {
        const errEmbed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Registry Missing:** No giveaway metadata records located for that message signature.");
        return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      if (data.ended !== true) {
        const errEmbed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Transaction Locked:** The targeted giveaway sequence must be fully completed before reroll calculations.");
        return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      // Safely access participants directly out of custom database object arrays
      const participants = data.entries || [];
      if (!participants.length) {
        const errEmbed = new EmbedBuilder()
          .setColor("#BA1A1A")
          .setDescription("❌ **Null Dataset:** Entry matrix holds zero registrations. Unable to execute lottery logic.");
        return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      const shuffled = [...participants].sort(() => 0.5 - Math.random());
      const chosenWinners = shuffled.slice(0, parseInt(data.winners)).map(id => `<@${id}>`);

      const channel = client.channels.cache.get(data.channelId) || await client.channels.fetch(data.channelId).catch(() => null);
      if (channel) {
        channel.send(`🎲 **GIVEAWAY MATRIX REROLLED**\n• **New Winners:** ${chosenWinners.join(", ")}\n• **Prize Allocation:** \`${data.prize}\``);
      }

      const finishEmbed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setDescription("🟢 **Re-indexing Completed:** Winners recalculated and dispatched over the channel terminal text grid.");
      return interaction.reply({ embeds: [finishEmbed], flags: MessageFlags.Ephemeral });
    }
  }
};

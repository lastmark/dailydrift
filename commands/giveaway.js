// /app/commands/giveaway.js
const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const ms = require("ms");

module.exports = {
  category: "Server Management",
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("⚙️ Start or manage server giveaways")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("start")
        .setDescription("🚀 Start a new giveaway")
        .addStringOption(opt => opt.setName("duration").setDescription("Time format (e.g., 1h, 30m, 1d)").setRequired(true))
        .addIntegerOption(opt => opt.setName("winners").setDescription("Number of winners").setRequired(true))
        .addStringOption(opt => opt.setName("prize").setDescription("The prize for the giveaway").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("end")
        .setDescription("🛑 Force end an active giveaway")
        .addStringOption(opt => opt.setName("message_id").setDescription("The giveaway message ID").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("reroll")
        .setDescription("🎲 Reroll winners from a finished giveaway")
        .addStringOption(opt => opt.setName("message_id").setDescription("The giveaway message ID").setRequired(true))
    ),

  async execute(interaction, client, redis) {
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
        return interaction.reply({ content: "❌ **Invalid Time:** Use formats like \`30m\`, \`2h\`, or \`1d\`.", flags: MessageFlags.Ephemeral });
      }

      const endTimestamp = Math.floor((Date.now() + durationMs) / 1000);

      const giveawayEmbed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle(`🎁 GIVEAWAY: ${prize.toUpperCase()}`)
        .setDescription(
          `**A new giveaway has started!**\n` +
          `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
          `• **Prize:** \`${prize}\`\n` +
          `• **Winners:** \`${winnerCount} ${winnerCount === 1 ? 'Winner' : 'Winners'}\`\n` +
          `• **Ends In:** <t:${endTimestamp}:R> (<t:${endTimestamp}:f>)\n` +
          `• **Hosted By:** ${interaction.user}\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
          `*Click the button below to enter the giveaway pool.*`
        )
        .setFooter({ text: `ACTIVE • 0 ENTRIES` })
        .setTimestamp();

      const joinButton = new ButtonBuilder()
        .setCustomId("giveaway_join")
        .setLabel("ENTER GIVEAWAY")
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder().addComponents(joinButton);
      const msg = await interaction.reply({ embeds: [giveawayEmbed], components: [row], fetchReply: true });

      const dataPayload = {
        messageId: msg.id,
        channelId: interaction.channel.id,
        guildId: guildId,
        prize: prize,
        winners: winnerCount.toString(),
        endsAt: (Date.now() + durationMs).toString(),
        ended: "false"
      };

      await redis.hset(`giveaway:${msg.id}`, dataPayload);
      return;
    }

    // ─── SUBCOMMAND: END ───
    if (sub === "end") {
      const msgId = interaction.options.getString("message_id");
      const data = await redis.hgetall(`giveaway:${msgId}`);

      if (!data || Object.keys(data).length === 0) {
        return interaction.reply({ content: "❌ **Not Found:** That message ID does not match an active giveaway.", flags: MessageFlags.Ephemeral });
      }

      if (data.ended === "true") {
        return interaction.reply({ content: "❌ **Ended:** This giveaway has already finished.", flags: MessageFlags.Ephemeral });
      }

      await redis.hset(`giveaway:${msgId}`, "endsAt", Date.now().toString()); 
      return interaction.reply({ content: "⚡ **Stopping Giveaway:** Ending the giveaway loop now. Stand by.", flags: MessageFlags.Ephemeral });
    }

    // ─── SUBCOMMAND: REROLL ───
    if (sub === "reroll") {
      const msgId = interaction.options.getString("message_id");
      const data = await redis.hgetall(`giveaway:${msgId}`);

      if (!data || Object.keys(data).length === 0) {
        return interaction.reply({ content: "❌ **Not Found:** No giveaway data found for that message ID.", flags: MessageFlags.Ephemeral });
      }

      if (data.ended !== "true") {
        return interaction.reply({ content: "❌ **Locked:** The giveaway must be finished before you can reroll it.", flags: MessageFlags.Ephemeral });
      }

      const participants = await redis.smembers(`giveaway:entries:${msgId}`);
      if (!participants || participants.length === 0) {
        return interaction.reply({ content: "❌ **No Entries:** Nobody entered this giveaway, cannot reroll.", flags: MessageFlags.Ephemeral });
      }

      const shuffled = participants.sort(() => 0.5 - Math.random());
      const chosenWinners = shuffled.slice(0, parseInt(data.winners)).map(id => `<@${id}>`);

      const channel = client.channels.cache.get(data.channelId);
      if (channel) {
        channel.send(`🎲 **GIVEAWAY REROLLED**\n• **New Winners:** ${chosenWinners.join(", ")}\n• **Prize:** \`${data.prize}\``);
      }

      return interaction.reply({ content: "✅ **Giveaway successfully rerolled.**", flags: MessageFlags.Ephemeral });
    }
  }
};

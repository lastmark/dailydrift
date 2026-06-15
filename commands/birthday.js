const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("🎂 Manage and configure the community birthday celebration matrix.")
    .addSubcommand(sub =>
      sub.setName("set")
        .setDescription("Save your birthday to the global network.")
        .addIntegerOption(opt => opt.setName("month").setDescription("Month of birth (1-12)").setRequired(true).setMinValue(1).setMaxValue(12))
        .addIntegerOption(opt => opt.setName("day").setDescription("Day of birth (1-31)").setRequired(true).setMinValue(1).setMaxValue(31))
    )
    .addSubcommand(sub =>
      sub.setName("setup")
        .setDescription("⚙️ Configure your birthday destination (Admins Only).")
        .addChannelOption(opt => opt.setName("channel").setDescription("Select an existing text channel").setRequired(false).addChannelTypes(ChannelType.GuildText))
        .addBooleanOption(opt => opt.setName("auto_create").setDescription("Set to true if you want the bot to create a new channel for you").setRequired(false))
    ),

  async execute(interaction, client, redis) {
    const subcommand = interaction.options.getSubcommand();

    // ==========================================
    // 🎂 SUBCOMMAND: SET GLOBAL USER BIRTHDAY
    // ==========================================
    if (subcommand === "set") {
      const month = interaction.options.getInteger("month");
      const day = interaction.options.getInteger("day");

      if (month === 2 && day > 29) return interaction.reply({ content: "❌ **Error:** February does not have more than 29 days.", ephemeral: true });
      if ([4, 6, 9, 11].includes(month) && day > 30) return interaction.reply({ content: "❌ **Error:** That month only has 30 days.", ephemeral: true });

      const formattedDate = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      await redis.hset(`profile:${interaction.user.id}`, "birthday", formattedDate);
      await redis.sadd(`birthdays:date:${formattedDate}`, interaction.user.id);

      return interaction.reply({ content: `🎂 **Success:** Your birthday has been logged globally as \`${formattedDate}\`!`, ephemeral: true });
    }

    // ==========================================
    // ⚙️ SUBCOMMAND: DYNAMIC SERVER SETUP
    // ==========================================
    if (subcommand === "setup") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ **Access Denied:** You need `Manage Server` permissions to run setup configurations.", ephemeral: true });
      }

      const selectedChannel = interaction.options.getChannel("channel");
      const autoCreate = interaction.options.getBoolean("auto_create");

      // Error guard: Admin provided absolutely no options
      if (!selectedChannel && !autoCreate) {
        return interaction.reply({ 
          content: "❌ **Setup Error:** You must either select an existing channel **OR** set `auto_create` to `True`.", 
          ephemeral: true 
        });
      }

      let targetChannel = selectedChannel;

      // 🛠️ Handle Automated Channel Creation
      if (!targetChannel && autoCreate === true) {
        await interaction.deferReply();

        try {
          // Check bot application permissions inside the server before building paths
          if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.editReply({ content: "❌ **System Error:** I am missing the `Manage Channels` permission required to automatically generate text rooms." });
          }

          // Build a brand new channel layer inside the guild matrix
          targetChannel = await interaction.guild.channels.create({
            name: "🎁-birthdays",
            type: ChannelType.GuildText,
            topic: "🎂 Daily community automated birthday celebration zone.",
            reason: "Automated birthday generation framework setup."
          });

          // Drop an introductory setup embed explaining the channel's purpose
          const welcomeEmbed = new EmbedBuilder()
            .setColor("#FF69B4")
            .setTitle("🎁 Birthday Central Loaded")
            .setDescription("This channel has been automatically created and configured. Celebrations will be broadcasted here every single day at midnight! 🎉\n\n💬 Use `/birthday set` to log your birthday.");
          
          await targetChannel.send({ embeds: [welcomeEmbed] }).catch(() => null);

        } catch (error) {
          console.error("Failed to execute dynamic channel creation:", error);
          return interaction.editReply({ content: "❌ Failed to automatically generate the channel. Please manually select an existing text channel instead." });
        }
      }

      // Commit the chosen/created channel ID straight into your Redis database
      if (targetChannel) {
        await redis.set(`birthday_channel:${interaction.guild.id}`, targetChannel.id);

        const responseMessage = `✅ **Configuration Locked:** Birthday celebrations are fully activated and routed to ${targetChannel}.`;
        
        if (interaction.deferred) {
          return await interaction.editReply({ content: responseMessage });
        } else {
          return await interaction.reply({ content: responseMessage });
        }
      }
    }
  }
};

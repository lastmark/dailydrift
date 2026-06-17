data: new SlashCommandBuilder()
  .setName("mod")
  .setDescription("Moderation control system")
  .setDefaultMemberPermissions(
    PermissionFlagsBits.KickMembers |
    PermissionFlagsBits.BanMembers |
    PermissionFlagsBits.ModerateMembers
  )

  .addSubcommand(s =>
    s.setName("kick")
      .setDescription("Kick a user")
      .addUserOption(o =>
        o.setName("target")
          .setDescription("User to kick")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("reason")
          .setDescription("Reason")
          .setRequired(false)
      )
  )

  .addSubcommand(s =>
    s.setName("ban")
      .setDescription("Ban a user")
      .addUserOption(o =>
        o.setName("target")
          .setDescription("User to ban")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("reason")
          .setDescription("Reason")
          .setRequired(false)
      )
  )

  .addSubcommand(s =>
    s.setName("unban")
      .setDescription("Unban user by ID")
      .addStringOption(o =>
        o.setName("id")
          .setDescription("User ID")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("reason")
          .setDescription("Reason")
          .setRequired(false)
      )
  )

  .addSubcommand(s =>
    s.setName("timeout")
      .setDescription("Timeout a user")
      .addUserOption(o =>
        o.setName("target")
          .setDescription("User to timeout")
          .setRequired(true)
      )
      .addIntegerOption(o =>
        o.setName("minutes")
          .setDescription("Duration in minutes")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("reason")
          .setDescription("Reason")
          .setRequired(false)
      )
  )

  .addSubcommand(s =>
    s.setName("lock")
      .setDescription("Lock current channel")
  )

  .addSubcommand(s =>
    s.setName("unlock")
      .setDescription("Unlock current channel")
  )

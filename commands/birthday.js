const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");


module.exports = {
  category: "User",

  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("    Set and manage your birthday information.")
    .addSubcommand(sub =>
      sub.setName("set")
        .setDescription("Save your birthday")
        .addIntegerOption(opt =>
          opt.setName("month")
            .setDescription("Month (1-12)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(12)
        )
        .addIntegerOption(opt =>
          opt.setName("day")
            .setDescription("Day (1-31)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(31)
        )
    )
    .addSubcommand(sub =>
      sub.setName("remove")
        .setDescription("Remove your birthday from the system")
    )
    .addSubcommand(sub =>
      sub.setName("setup")
        .setDescription("Configure birthday channel")
        .addChannelOption(opt =>
          opt.setName("channel")
            .setDescription("Select channel for birthday announcements")
            .addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption(opt =>
          opt.setName("auto_create")
            .setDescription("Auto create a birthday channel")
        )
        .addRoleOption(opt =>
          opt.setName("role")
            .setDescription("Role to ping on birthdays (optional)")
        )
    )
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("Show all saved birthdays in this server")
    )
    .addSubcommand(sub =>
      sub.setName("upcoming")
        .setDescription("Show next upcoming birthdays")
    )
    .addSubcommand(sub =>
      sub.setName("stats")
        .setDescription("Show birthday statistics")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // -------------------- HELPERS --------------------
    const getBirthday = async (id) => {
      return await redis.hget(`birthday:user:${guildId}`, id);
    };

    const getAllBirthdays = async () => {
      return await redis.hgetall(`birthday:user:${guildId}`) || {};
    };

    const getChannel = async () => {
      const channelId = await redis.get(`birthday:channel:${guildId}`);
      if (!channelId) return null;
      try {
        return await interaction.guild.channels.fetch(channelId);
      } catch {
        return null;
      }
    };

    const getRole = async () => {
      const roleId = await redis.get(`birthday:role:${guildId}`);
      if (!roleId) return null;
      try {
        return await interaction.guild.roles.fetch(roleId);
      } catch {
        return null;
      }
    };

    const getAge = (month, day) => {
      const today = new Date();
      let age = today.getFullYear();
      const birthDate = new Date(today.getFullYear(), month - 1, day);
      if (birthDate > today) age--;
      return age;
    };

    const formatDate = (month, day) => {
      const months = ["January", "February", "March", "April", "May", "June", 
                      "July", "August", "September", "October", "November", "December"];
      return `${months[month - 1]} ${day}`;
    };

    // ==================== SET BIRTHDAY ====================
    if (sub === "set") {
      const month = interaction.options.getInteger("month");
      const day = interaction.options.getInteger("day");

      // Validate date
      const isValidDate = (m, d) => {
        const date = new Date(2000, m - 1, d);
        return date.getMonth() === m - 1 && date.getDate() === d;
      };

      if (!isValidDate(month, day)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setTitle("Invalid Date")
              .setDescription(`${e.error || "❌"} Please enter a valid date.`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const formatted = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      
      // Remove old date if exists
      const oldDate = await getBirthday(userId);
      if (oldDate) {
        await redis.srem(`birthday:date:${guildId}:${oldDate}`, userId);
      }

      // Save new birthday
      await redis.hset(`birthday:user:${guildId}`, userId, formatted);
      await redis.sadd(`birthday:date:${guildId}:${formatted}`, userId);

      const age = getAge(month, day);
      const dateStr = formatDate(month, day);
      const zodiac = getZodiac(month, day);

      const embed = new EmbedBuilder()
        .setColor("#FF69B4")
        .setAuthor({
          name: "🎂 Birthday Saved!",
          iconURL: interaction.user.displayAvatarURL()
        })
        .setDescription(`${e.success || "✅"} Your birthday has been saved successfully!`)
        .addFields(
          { name: "📅 Date", value: `**${dateStr}**`, inline: true },
          { name: "🎈 Age", value: `**${age}** years old`, inline: true },
          { name: "♈ Zodiac", value: `**${zodiac}**`, inline: true }
        )
        .setColor("#FF69B4")
        .setFooter({ text: "We'll remind everyone on your special day!" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ==================== REMOVE BIRTHDAY ====================
    if (sub === "remove") {
      const birthday = await getBirthday(userId);
      if (!birthday) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`${e.error || "❌"} You don't have a birthday saved.`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      await redis.hdel(`birthday:user:${guildId}`, userId);
      await redis.srem(`birthday:date:${guildId}:${birthday}`, userId);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setDescription(`${e.success || "✅"} Your birthday has been removed.`)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // ==================== SETUP ====================
    if (sub === "setup") {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

      if (!isAdmin) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(`${e.error || "❌"} Missing **Manage Server** permission.`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const channel = interaction.options.getChannel("channel");
      const autoCreate = interaction.options.getBoolean("auto_create");
      const role = interaction.options.getRole("role");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // --- Channel setup ---
      let targetChannel = channel;

      if (!targetChannel && autoCreate) {
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor("#ED4245")
                .setDescription(`${e.error || "❌"} I need **Manage Channels** permission.`)
            ]
          });
        }

        targetChannel = await interaction.guild.channels.create({
          name: "🎂-birthdays",
          type: ChannelType.GuildText,
          topic: "🎉 Birthday celebration system",
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            }
          ]
        });

        await targetChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF69B4")
              .setTitle("🎂 Birthday System Activated!")
              .setDescription("This channel will automatically post birthday celebrations for all members who have set their birthday.")
              .addFields(
                { name: "📝 How to set your birthday", value: "Use `/birthday set`", inline: true },
                { name: "📋 View all birthdays", value: "Use `/birthday list`", inline: true }
              )
              .setFooter({ text: "Happy birthday to everyone!" })
          ]
        }).catch(() => null);
      }

      if (targetChannel) {
        await redis.set(`birthday:channel:${guildId}`, targetChannel.id);
      }

      // --- Role setup ---
      if (role) {
        await redis.set(`birthday:role:${guildId}`, role.id);
      } else {
        await redis.del(`birthday:role:${guildId}`);
      }

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ Configuration Updated")
        .addFields(
          { 
            name: "📢 Channel", 
            value: targetChannel ? `${targetChannel}` : "Not set", 
            inline: true 
          },
          { 
            name: "🔔 Role", 
            value: role ? `${role}` : "Not set", 
            inline: true 
          }
        )
        .setFooter({ text: "Birthday system is now ready!" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ==================== LIST ====================
    if (sub === "list") {
      const data = await getAllBirthdays();
      const entries = Object.entries(data);

      if (!entries.length) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#2B2D31")
              .setTitle("📋 No Birthdays")
              .setDescription("No one has set their birthday yet. Be the first!")
              .setFooter({ text: "Use /birthday set to add yours!" })
          ]
        });
      }

      // Group by month
      const grouped = {};
      for (const [id, bday] of entries) {
        const month = bday.split("-")[0];
        if (!grouped[month]) grouped[month] = [];
        grouped[month].push({ id, bday });
      }

      const months = ["January", "February", "March", "April", "May", "June", 
                      "July", "August", "September", "October", "November", "December"];

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(`🎂 Server Birthdays (${entries.length})`)
        .setDescription(`Here's everyone's birthday in ${interaction.guild.name}`)
        .setFooter({ text: `Total: ${entries.length} birthdays` })
        .setTimestamp();

      const sortedMonths = Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b));
      
      let fieldCount = 0;
      for (const month of sortedMonths) {
        if (fieldCount >= 25) break;
        const birthdays = grouped[month];
        const names = birthdays.map(b => `<@${b.id}> → **${b.bday}**`).join("\n");
        embed.addFields({
          name: `📅 ${months[parseInt(month) - 1]}`,
          value: birthdays.length > 5 ? `${birthdays.length} birthdays` : names,
          inline: true
        });
        fieldCount++;
      }

      return interaction.reply({ embeds: [embed] });
    }

    // ==================== UPCOMING ====================
    if (sub === "upcoming") {
      const data = await getAllBirthdays();
      const entries = Object.entries(data);

      if (!entries.length) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#2B2D31")
              .setTitle("📅 No Upcoming Birthdays")
              .setDescription("No birthdays set yet.")
          ]
        });
      }

      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentDay = now.getDate();

      // Find upcoming birthdays
      const upcoming = entries
        .map(([id, bday]) => {
          const [month, day] = bday.split("-").map(Number);
          let daysUntil;
          if (month > currentMonth || (month === currentMonth && day >= currentDay)) {
            const date = new Date(now.getFullYear(), month - 1, day);
            daysUntil = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
          } else {
            const date = new Date(now.getFullYear() + 1, month - 1, day);
            daysUntil = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
          }
          return { id, bday, daysUntil, month, day };
        })
        .sort((a, b) => a.daysUntil - b.daysUntil)
        .slice(0, 10);

      const embed = new EmbedBuilder()
        .setColor("#FF69B4")
        .setTitle("🎉 Upcoming Birthdays")
        .setDescription("Here are the next 10 birthdays coming up!")
        .setFooter({ text: "🎂 Get ready to celebrate!" })
        .setTimestamp();

      for (const b of upcoming) {
        const dateStr = formatDate(b.month, b.day);
        embed.addFields({
          name: `🎈 ${dateStr}`,
          value: `<@${b.id}> → ${b.daysUntil === 0 ? "🎂 TODAY!" : `in ${b.daysUntil} days`}`,
          inline: true
        });
      }

      return interaction.reply({ embeds: [embed] });
    }

    // ==================== STATS ====================
    if (sub === "stats") {
      const data = await getAllBirthdays();
      const entries = Object.entries(data);
      const total = entries.length;

      if (!total) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#2B2D31")
              .setTitle("📊 Birthday Statistics")
              .setDescription("No data available yet.")
          ]
        });
      }

      // Count birthdays by month
      const monthCounts = {};
      for (const [_, bday] of entries) {
        const month = bday.split("-")[0];
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      }

      const months = ["January", "February", "March", "April", "May", "June", 
                      "July", "August", "September", "October", "November", "December"];

      const mostPopularMonth = Object.entries(monthCounts)
        .sort((a, b) => b[1] - a[1])[0];

      // Calculate average age
      const today = new Date();
      let totalAge = 0;
      let ageCount = 0;
      for (const [_, bday] of entries) {
        const [month, day] = bday.split("-").map(Number);
        let age = today.getFullYear();
        const birthDate = new Date(today.getFullYear(), month - 1, day);
        if (birthDate > today) age--;
        totalAge += age;
        ageCount++;
      }

      const avgAge = ageCount > 0 ? Math.round(totalAge / ageCount) : 0;

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("📊 Birthday Statistics")
        .addFields(
          { name: "👥 Total Birthdays", value: `${total}`, inline: true },
          { name: "📅 Most Popular Month", value: `${months[parseInt(mostPopularMonth[0]) - 1]} (${mostPopularMonth[1]})`, inline: true },
          { name: "📊 Average Age", value: `${avgAge} years`, inline: true }
        )
        .setFooter({ text: "Birthday system statistics" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};

// -------------------- ZODIAC HELPER --------------------
function getZodiac(month, day) {
  const zodiac = [
    { sign: "Capricorn", start: [1, 1], end: [1, 19] },
    { sign: "Aquarius", start: [1, 20], end: [2, 18] },
    { sign: "Pisces", start: [2, 19], end: [3, 20] },
    { sign: "Aries", start: [3, 21], end: [4, 19] },
    { sign: "Taurus", start: [4, 20], end: [5, 20] },
    { sign: "Gemini", start: [5, 21], end: [6, 20] },
    { sign: "Cancer", start: [6, 21], end: [7, 22] },
    { sign: "Leo", start: [7, 23], end: [8, 22] },
    { sign: "Virgo", start: [8, 23], end: [9, 22] },
    { sign: "Libra", start: [9, 23], end: [10, 22] },
    { sign: "Scorpio", start: [10, 23], end: [11, 21] },
    { sign: "Sagittarius", start: [11, 22], end: [12, 21] },
    { sign: "Capricorn", start: [12, 22], end: [12, 31] }
  ];

  for (const z of zodiac) {
    const [sMonth, sDay] = z.start;
    const [eMonth, eDay] = z.end;
    const start = new Date(2000, sMonth - 1, sDay);
    const end = new Date(2000, eMonth - 1, eDay);
    const date = new Date(2000, month - 1, day);
    
    if (date >= start && date <= end) {
      return z.sign;
    }
  }
  return "Unknown";
}

// commands/birthday.js – Advanced Birthday Tracking System
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
    .setDescription("Set and manage your birthday information.")
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

  async execute(interaction, client, db) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // -------------------- HELPERS --------------------
    const getBirthday = async (id) => {
      const allBirthdays = await db.get(`birthday:user:${guildId}`) || {};
      return allBirthdays[id] || null;
    };

    const getAllBirthdays = async () => {
      return await db.get(`birthday:user:${guildId}`) || {};
    };

    const getChannel = async () => {
      const channelId = await db.get(`birthday:channel:${guildId}`);
      if (!channelId) return null;
      try {
        return await interaction.guild.channels.fetch(channelId);
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

      const isValidDate = (m, d) => {
        const date = new Date(2000, m - 1, d);
        return date.getMonth() === m - 1 && date.getDate() === d;
      };

      if (!isValidDate(month, day)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#BA1A1A")
              .setDescription("❌ **Invalid Parameter:** Please provide a valid calendar month and day combination.")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const formatted = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      
      const allBirthdays = await getAllBirthdays();
      const oldDate = allBirthdays[userId];

      if (oldDate) {
        let oldDatePool = await db.get(`birthday:date:${guildId}:${oldDate}`) || [];
        if (Array.isArray(oldDatePool)) {
          oldDatePool = oldDatePool.filter(id => id !== userId);
          await db.set(`birthday:date:${guildId}:${oldDate}`, oldDatePool);
        }
      }

      // Save to main dataset mappings
      allBirthdays[userId] = formatted;
      await db.set(`birthday:user:${guildId}`, allBirthdays);

      // Push to targeted date array
      let targetDatePool = await db.get(`birthday:date:${guildId}:${formatted}`) || [];
      if (!Array.isArray(targetDatePool)) targetDatePool = [];
      if (!targetDatePool.includes(userId)) targetDatePool.push(userId);
      await db.set(`birthday:date:${guildId}:${formatted}`, targetDatePool);

      const age = getAge(month, day);
      const dateStr = formatDate(month, day);
      const zodiac = getZodiac(month, day);

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A") // Premium minimalist background styling
        .setTitle("🎂 Birthday Registry Updated")
        .setDescription(`Your local profile metadata has been logged into the global server node successfully.`)
        .addFields(
          { name: "📅 Stored Date", value: `\`${dateStr}\``, inline: true },
          { name: "🎈 Current Cycle", value: `\`${age} years old\``, inline: true },
          { name: "♈ Constellation", value: `\`${zodiac}\``, inline: true }
        )
        .setFooter({ text: "AUTOMATED SYSTEM LAYER ACTIVE" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ==================== REMOVE BIRTHDAY ====================
    if (sub === "remove") {
      const allBirthdays = await getAllBirthdays();
      const birthday = allBirthdays[userId];

      if (!birthday) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#BA1A1A")
              .setDescription("❌ You do not have an active birthday registry logged inside this server.")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      delete allBirthdays[userId];
      await db.set(`birthday:user:${guildId}`, allBirthdays);

      let datePool = await db.get(`birthday:date:${guildId}:${birthday}`) || [];
      if (Array.isArray(datePool)) {
        datePool = datePool.filter(id => id !== userId);
        await db.set(`birthday:date:${guildId}:${birthday}`, datePool);
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#0A0A0A")
            .setDescription("🟢 **Registry Purged:** Your birthday signature data has been erased from the server matrix.")
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
              .setColor("#BA1A1A")
              .setDescription("❌ Administrative authority failure: Missing \`ManageGuild\` permission flag.")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const channel = interaction.options.getChannel("channel");
      const autoCreate = interaction.options.getBoolean("auto_create");
      const role = interaction.options.getRole("role");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let targetChannel = channel;

      if (!targetChannel && autoCreate) {
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor("#BA1A1A")
                .setDescription("❌ Missing bot system authority flag: Client requires \`ManageChannels\` clearance.")
            ]
          });
        }

        targetChannel = await interaction.guild.channels.create({
          name: "🎂-birthdays",
          type: ChannelType.GuildText,
          topic: "🎉 Birthday celebration system pipeline",
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
              .setColor("#0A0A0A")
              .setTitle("🎂 Birthday Engine Booted")
              .setDescription("This streaming terminal channel will handle automatically broadcasting member birthday events instantly.")
              .addFields(
                { name: "📝 Set Birthday", value: "Use \`/birthday set\`", inline: true },
                { name: "📋 View Calendar", value: "Use \`/birthday list\`", inline: true }
              )
          ]
        }).catch(() => null);
      }

      if (targetChannel) {
        await db.set(`birthday:channel:${guildId}`, targetChannel.id);
      }

      if (role) {
        await db.set(`birthday:role:${guildId}`, role.id);
      } else {
        await db.del(`birthday:role:${guildId}`);
      }

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle("🛡️ System Pipeline Configured")
        .addFields(
          { name: "📢 Terminal Target", value: targetChannel ? `${targetChannel}` : "`None/Disabled`", inline: true },
          { name: "🔔 Announce Role", value: role ? `${role}` : "`None/Disabled`", inline: true }
        )
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
              .setColor("#0A0A0A")
              .setTitle("📋 Dataset Empty")
              .setDescription("No profiles have configured active birthday parameters inside this cluster node yet.")
          ]
        });
      }

      const grouped = {};
      for (const [id, bday] of entries) {
        const month = bday.split("-")[0];
        if (!grouped[month]) grouped[month] = [];
        grouped[month].push({ id, bday });
      }

      const months = ["January", "February", "March", "April", "May", "June", 
                      "July", "August", "September", "October", "November", "December"];

      const embed = new EmbedBuilder()
        .setColor("#0A0A0A")
        .setTitle(`🎂 Guild Birthday Registries (${entries.length})`)
        .setDescription(`Current directory listings for active accounts tracking within **${interaction.guild.name}**`)
        .setTimestamp();

      const sortedMonths = Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b));
      
      let fieldCount = 0;
      for (const month of sortedMonths) {
        if (fieldCount >= 25) break;
        const birthdays = grouped[month];
        const names = birthdays.map(b => `<@${b.id}> ➔ \`${b.bday}\``).join("\n");
        embed.addFields({
          name: `📅 ${months[parseInt(month) - 1]}`,
          value: birthdays.length > 5 ? `\`${birthdays.length} entries active\`` : names,
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
              .setColor("#0A0A0A")
              .setTitle("📅 Queue Status Clear")
              .setDescription("No birthdays are currently logged inside the operational queue database.")
          ]
        });
      }

      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentDay = now.getDate();

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
        .setColor("#0A0A0A")
        .setTitle("🎉 Queue Lookahead Matrix")
        .setDescription("The next 10 approaching profile event indexes currently running on line:")
        .setTimestamp();

      for (const b of upcoming) {
        const dateStr = formatDate(b.month, b.day);
        embed.addFields({
          name: `🎈 ${dateStr}`,
          value: `<@${b.id}> ➔ ${b.daysUntil === 0 ? "⚡ **TODAY**" : `\`in ${b.daysUntil} days\``}`,
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
              .setColor("#0A0A0A")
              .setTitle("📊 Operational Matrix Statline")
              .setDescription("Insufficient log metrics available to construct analytical data tracks.")
          ]
        });
      }

      const monthCounts = {};
      for (const [_, bday] of entries) {
        const month = bday.split("-")[0];
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      }

      const months = ["January", "February", "March", "April", "May", "June", 
                      "July", "August", "September", "October", "November", "December"];

      const mostPopularMonth = Object.entries(monthCounts)
        .sort((a, b) => b[1] - a[1])[0];

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
        .setColor("#0A0A0A")
        .setTitle("📊 Operational Matrix Statline")
        .addFields(
          { name: "👥 Registries Active", value: `\`${total}\``, inline: true },
          { name: "📅 Peak Event Month", value: `\`${months[parseInt(mostPopularMonth[0]) - 1]} (${mostPopularMonth[1]} entries)\``, inline: true },
          { name: "📊 Mean Node Age", value: `\`${avgAge} years\``, inline: true }
        )
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

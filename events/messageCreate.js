const { Events, EmbedBuilder } = require("discord.js");

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client, redis) {
    if (!message.guild || message.author.bot) return;

    const prefix = "!";
    const guildId = message.guild.id;
    const userId = message.author.id;

    // ─── PART A: PREMIUM EXPERIENCE (XP) & ECONOMY HOOK MULTIPLIER ───
    const isUserPremium = await redis.get(`premium:user:${userId}`);
    let baseRewardXP = Math.floor(Math.random() * 10) + 15; 
    let baseCoins = 20;

    if (isUserPremium) {
      baseRewardXP *= 2; // Apply a crisp 2.0x boost hook for premium tier members
      baseCoins *= 2;
    }
    // Downstream engine logic would save baseRewardXP / baseCoins into your master economy database here.


    // ─── PART B: TEXT INTERACTION AUTO-RESPONDER PARSING ENGINE ───
    const cleanTrigger = message.content.trim().toLowerCase();
    const savedResponder = await redis.get(`responder:${guildId}:${cleanTrigger}`);
    
    if (savedResponder) {
      const { title, reply, color } = JSON.parse(savedResponder);
      const responseEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(reply)
        .setTimestamp();

      await message.channel.send({ embeds: [responseEmbed] }).catch(() => null);
    }


    // ─── PART C: HIDDEN DEV MANAGEMENT MATRIX ───
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const DEVELOPER_ID = "1303357369622990889";

    if (command === "premium") {
      if (userId !== DEVELOPER_ID) return; 

      const action = args[0]?.toLowerCase(); // "add" or "remove"
      const type = args[1]?.toLowerCase();   // "user" or "guild"

      if (!action || !["add", "remove"].includes(action) || !type || !["user", "guild"].includes(type)) {
        return message.reply(
          "❌ **Usage Commands:**\n" +
          "🔹 `!premium add user <@user/ID> <duration>`\n" +
          "🔹 `!premium add guild <Guild_ID> <duration>`\n" +
          "🔹 `!premium remove user <@user/ID>`\n" +
          "🔹 `!premium remove guild <Guild_ID>`\n\n" +
          "💡 *Durations: 1m, 3m, 1y, perm*"
        );
      }

      const rawTargetInput = args[2];
      if (!rawTargetInput) return message.reply(`❌ **Error:** Please specify a target ${type} identifier string.`);
      
      const cleanId = rawTargetInput.replace(/[<@!&>]/g, "");
      let targetName = "";
      let dmTarget = null;

      if (type === "user") {
        const targetUser = await client.users.fetch(cleanId).catch(() => null);
        if (!targetUser) return message.reply("❌ **Error:** Unable to resolve that user target profile.");
        targetName = targetUser.username;
        dmTarget = targetUser; 
      } else if (type === "guild") {
        const targetGuild = await client.guilds.fetch(cleanId).catch(() => null);
        targetName = targetGuild ? targetGuild.name : `Guild ID: ${cleanId}`;
        if (targetGuild) {
          dmTarget = await client.users.fetch(targetGuild.ownerId).catch(() => null); 
        }
      }

      const premiumKey = `premium:${type}:${cleanId}`;

      if (action === "add") {
        const durationInput = args[3]?.toLowerCase(); 
        if (!durationInput) return message.reply(`❌ **Error:** Please specify a duration. Example: \`!premium add ${type} ${rawTargetInput} 1m\``);

        let durationSeconds = 0;
        let timeString = "";

        if (durationInput === "1m") {
          durationSeconds = 30 * 24 * 60 * 60; 
          timeString = "30 Days (1 Month)";
        } else if (durationInput === "3m") {
          durationSeconds = 90 * 24 * 60 * 60; 
          timeString = "90 Days (3 Months)";
        } else if (durationInput === "1y") {
          durationSeconds = 365 * 24 * 60 * 60; 
          timeString = "365 Days (1 Year)";
        } else if (durationInput === "perm") {
          durationSeconds = -1; 
          timeString = "Permanent (Lifetime Access)";
        } else {
          return message.reply("❌ **Invalid Duration:** Use `1m`, `3m`, `1y`, or `perm`.");
        }

        if (durationSeconds === -1) {
          await redis.set(premiumKey, "perm");
        } else {
          await redis.setex(premiumKey, durationSeconds, "true");
        }

        if (type === "guild") {
          await redis.set(`antispam:toggle:${cleanId}`, "true");
        }

        let dmSentStatus = "";
        if (dmTarget) {
          const premiumDmEmbed = new EmbedBuilder()
            .setColor("#00FFAC")
            .setTitle(type === "user" ? "💎 Your Personal Premium is Live!" : "🏢 Server Guild Premium Activated!")
            .setDescription(
              `Thank you for your purchase, bro! Your payment has been completely verified.\n\n` +
              `📦 **Subscription Plan Details:**\n` +
              `• **License Type:** \`${type.toUpperCase()} Tier\`\n` +
              `• **Assigned To:** **${targetName}** (\`${cleanId}\`)\n` +
              `• **Time Frame:** \`${timeString}\`\n\n` +
              `${type === "guild" 
                ? "⚡ **What's Next?** Your server has full access to high-speed Anti-Spam protection! Use `/premium-set` to manage your configurations." 
                : "✨ **What's Next?** Your personal luxury profile design assets have been unlocked successfully across the grid!"}`
            )
            .setFooter({ text: "Thank you for supporting the development pipeline core." })
            .setTimestamp();

          const dmSuccess = await dmTarget.send({ embeds: [premiumDmEmbed] }).catch(() => null);
          dmSentStatus = dmSuccess ? "\n📥 **DM Alert:** Dispatched confirmation directly to client." : "\n⚠️ **DM Alert:** Failed to message client (DMs closed).";
        }

        return message.reply(`👑 **Global ${type.toUpperCase()} Premium Activated:**\n🎯 **Target:** ${targetName} (\`${cleanId}\`)\n⏳ **Duration:** \`${timeString}\`${dmSentStatus}`);
      }

      if (action === "remove") {
        await redis.del(premiumKey);
        if (type === "guild") await redis.del(`antispam:toggle:${cleanId}`);
        
        if (dmTarget) {
          const expireDmEmbed = new EmbedBuilder()
            .setColor("#FF3366")
            .setDescription(`🔴 Your Premium subscription tier allocation for **${targetName}** has officially been terminated by the developer.`);
          await dmTarget.send({ embeds: [expireDmEmbed] }).catch(() => null);
        }

        return message.reply(`🗑️ **Global ${type.toUpperCase()} Premium Revoked for: ${targetName}**.`);
      }
    }
  }
};

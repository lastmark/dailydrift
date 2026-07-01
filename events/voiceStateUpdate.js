// events/voiceStateUpdate.js – no DM on creation, only on limit
const { Events, ChannelType, PermissionFlagsBits } = require("discord.js");

module.exports = {
  name: Events.VoiceStateUpdate,

  async execute(oldState, newState, client, db) {
    const guildId = newState.guild.id;

    // Get the hub channel ID
    const hubId = await db.get(`vip:${guildId}:hub`);
    if (!hubId) return;

    // ---- USER JOINED THE HUB ----
    if (newState.channelId === hubId && oldState.channelId !== hubId) {
      const userId = newState.member.id;
      const guild = newState.guild;

      // Check premium status
      const isPremium = await db.get(`premium:guild:${guildId}`) !== null;

      // Count user's current VIP channels
      let createdChannels = (await db.get(`vip:${guildId}:createdChannels`)) || [];
      if (!Array.isArray(createdChannels)) createdChannels = [];
      
      let userChannelCount = 0;
      for (const channelId of createdChannels) {
        const channelData = (await db.get(`vip:${guildId}:${channelId}`)) || {};
        if (channelData.owner === userId) userChannelCount++;
      }

      // Limit check (standard = 3, premium = unlimited)
      if (!isPremium && userChannelCount >= 3) {
        // Disconnect the user from voice
        try {
          await newState.member.voice.disconnect();
          await newState.member.send("❌ You've reached the **3-channel limit** for standard servers. Upgrade to Premium for unlimited VIP channels.");
        } catch {}
        return;
      }

      // ---- Create a new 2-person voice channel ----
      try {
        const bot = guild.members.me;
        if (!bot.permissions.has(PermissionFlagsBits.ManageChannels)) {
          console.error("[VIP] Bot lacks Manage Channels permission.");
          return;
        }

        const channelName = `${newState.member.displayName}'s VIP`;
        const channel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildVoice,
          userLimit: 2,
          parent: newState.channel.parentId || null,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.Connect],
            },
            {
              id: userId,
              allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels],
            }
          ]
        });

        // Add channel to set tracking array
        createdChannels.push(channel.id);
        await db.set(`vip:${guildId}:createdChannels`, createdChannels);

        // Store channel configuration object
        await db.set(`vip:${guildId}:${channel.id}`, {
          owner: userId,
          createdAt: Date.now()
        });

        // Move the user into the new channel
        await newState.member.voice.setChannel(channel);

      } catch (error) {
        console.error("[VIP] Error creating VIP channel:", error);
      }
    }

    // ---- USER LEFT A VIP CHANNEL – delete instantly if empty ----
    if (oldState.channelId && oldState.channelId !== hubId) {
      const channelId = oldState.channelId;
      
      let createdChannels = (await db.get(`vip:${guildId}:createdChannels`)) || [];
      if (!Array.isArray(createdChannels)) createdChannels = [];

      const isVip = createdChannels.includes(channelId);
      if (!isVip) return;

      // Wait 1 second to let Discord update the member list
      setTimeout(async () => {
        const channel = oldState.guild.channels.cache.get(channelId);
        if (channel && channel.members.size === 0) {
          try {
            await channel.delete("Auto-deleted – empty VIP channel");
            
            // Filter target out from array to simulate srem
            createdChannels = createdChannels.filter(id => id !== channelId);
            await db.set(`vip:${guildId}:createdChannels`, createdChannels);
            
            await db.del(`vip:${guildId}:${channelId}`);
          } catch (err) {
            console.error("[VIP] Failed to auto-delete VIP channel:", err);
          }
        }
      }, 1000); // 1-second delay
    }
  }
};

// events/voiceStateUpdate.js
const { Events, ChannelType, PermissionFlagsBits } = require("discord.js");

module.exports = {
  name: Events.VoiceStateUpdate,

  async execute(oldState, newState, client, redis) {
    const guildId = newState.guild.id;

    // Get the hub channel ID
    const hubId = await redis.get(`vip:${guildId}:hub`);
    if (!hubId) return;

    // ---- USER JOINED THE HUB ----
    if (newState.channelId === hubId && oldState.channelId !== hubId) {
      const userId = newState.member.id;
      const guild = newState.guild;

      // Check premium status
      const isPremium = await redis.get(`premium:guild:${guildId}`) !== null;

      // Count user's current VIP channels
      const createdChannels = await redis.smembers(`vip:${guildId}:createdChannels`);
      let userChannelCount = 0;
      for (const channelId of createdChannels) {
        const owner = await redis.hget(`vip:${guildId}:${channelId}`, "owner");
        if (owner === userId) userChannelCount++;
      }

      // Limit check (standard = 3, premium = unlimited)
      if (!isPremium && userChannelCount >= 3) {
        try {
          await newState.member.send("❌ You've reached the **3-channel limit** for standard servers. Upgrade to Premium for unlimited VIP channels.");
        } catch {}
        return; // Do not create a channel
      }

      // ---- Create a new 2-person voice channel ----
      try {
        const bot = guild.members.me;
        if (!bot.permissions.has(PermissionFlagsBits.ManageChannels)) {
          console.error("Bot lacks Manage Channels permission.");
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

        // Save to Redis
        await redis.sadd(`vip:${guildId}:createdChannels`, channel.id);
        await redis.hset(`vip:${guildId}:${channel.id}`, {
          owner: userId,
          createdAt: Date.now()
        });

        // Move the user into the new channel
        await newState.member.voice.setChannel(channel);

        await newState.member.send(`✅ Your VIP channel **${channelName}** has been created! Use /rename-vip to change its name.`)
          .catch(() => {});

      } catch (error) {
        console.error("Error creating VIP channel:", error);
      }
    }

    // ---- USER LEFT A VIP CHANNEL (check if empty) ----
    if (oldState.channelId && oldState.channelId !== hubId) {
      const channelId = oldState.channelId;
      const isVip = await redis.sismember(`vip:${guildId}:createdChannels`, channelId);
      if (!isVip) return;

      const channel = oldState.guild.channels.cache.get(channelId);
      if (!channel) {
        // Channel already deleted – clean up Redis
        await redis.srem(`vip:${guildId}:createdChannels`, channelId);
        await redis.del(`vip:${guildId}:${channelId}`);
        return;
      }

      // Check if empty (after delay to allow reconnects)
      setTimeout(async () => {
        const freshChannel = oldState.guild.channels.cache.get(channelId);
        if (freshChannel && freshChannel.members.size === 0) {
          try {
            await freshChannel.delete("Auto-deleted – empty VIP channel");
            await redis.srem(`vip:${guildId}:createdChannels`, channelId);
            await redis.del(`vip:${guildId}:${channelId}`);
          } catch (err) {
            console.error("Failed to auto-delete VIP channel:", err);
          }
        }
      }, 10000); // 10-second delay
    }
  }
};

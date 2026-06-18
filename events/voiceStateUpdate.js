// events/voiceStateUpdate.js – instant delete + disconnect on limit
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
        console.error("[VIP] Error creating VIP channel:", error);
      }
    }

    // ---- USER LEFT A VIP CHANNEL – delete instantly if empty ----
    if (oldState.channelId && oldState.channelId !== hubId) {
      const channelId = oldState.channelId;
      const isVip = await redis.sismember(`vip:${guildId}:createdChannels`, channelId);
      if (!isVip) return;

      // Wait 1 second to let Discord update the member list
      setTimeout(async () => {
        const channel = oldState.guild.channels.cache.get(channelId);
        if (channel && channel.members.size === 0) {
          try {
            await channel.delete("Auto-deleted – empty VIP channel");
            await redis.srem(`vip:${guildId}:createdChannels`, channelId);
            await redis.del(`vip:${guildId}:${channelId}`);
          } catch (err) {
            console.error("[VIP] Failed to auto-delete VIP channel:", err);
          }
        }
      }, 1000); // 1-second delay
    }
  }
};

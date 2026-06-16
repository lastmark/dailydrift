const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile-edit")
    .setDescription("💎 Premium Only: Personalize your profile assets.")
    .addStringOption(opt => opt.setName("bio").setDescription("Set your customized biography paragraph line."))
    .addStringOption(opt => opt.setName("hex").setDescription("Set a luxury theme profile color (e.g., #00FFAC)"))
    .addStringOption(opt => opt.setName("banner").setDescription("Provide a direct image URL link for your card banner")),

  async execute(interaction, client, redis) {
    const userId = interaction.user.id;

    const isPremium = await redis.get(`premium:user:${userId}`);
    if (!isPremium) {
      return interaction.reply({
        content: "❌ **Access Denied:** Unlocking profile art customization requires an active **User Premium** subscription tier.",
        flags: [MessageFlags.Ephemeral]
      });
    }

    const bioInput = interaction.options.getString("bio");
    const hexInput = interaction.options.getString("hex");
    const bannerInput = interaction.options.getString("banner");

    if (bioInput) await redis.set(`profile:bio:${userId}`, bioInput);
    
    if (hexInput) {
      if (!/^#[0-9A-F]{6}$/i.test(hexInput)) {
        return interaction.reply({ content: "❌ **Format Error:** Your color hex code must look like `#00FFAC`.", flags: [MessageFlags.Ephemeral] });
      }
      await redis.set(`profile:hex:${userId}`, hexInput);
    }
    
    if (bannerInput) {
      if (!bannerInput.startsWith("http")) {
        return interaction.reply({ content: "❌ **Format Error:** Provide a valid web image link (`https://...`)", flags: [MessageFlags.Ephemeral] });
      }
      await redis.set(`profile:banner:${userId}`, bannerInput);
    }

    return interaction.reply({ content: "✅ **Assets Compiled:** Your profile display layout has been updated.", flags: [MessageFlags.Ephemeral] });
  }
};

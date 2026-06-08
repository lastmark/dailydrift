const { SlashCommandBuilder } = require("discord.js");
const config = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dev")
    .setDescription("Developer commands")
    .addSubcommand(sub => sub.setName("eval").setDescription("Evaluate JS code").addStringOption(opt => opt.setName("code").setRequired(true)))
    .addSubcommand(sub => sub.setName("presence").setDescription("Set bot status").addStringOption(opt => opt.setName("text").setRequired(true))),
  async execute(interaction) {
    if (interaction.user.id !== process.env.DEV_USER_ID) 
      return interaction.reply({ content: `${config.ICONS.error} No permission.`, ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === "eval") {
      try {
        const code = interaction.options.getString("code");
        let result = eval(code);
        if (typeof result !== "string") result = require("util").inspect(result);
        await interaction.reply({ content: `${config.ICONS.bot} \`\`\`js\n${result.slice(0, 1900)}\n\`\`\``, ephemeral: true });
      } catch(e) { await interaction.reply({ content: `${config.ICONS.error} Error: ${e}`, ephemeral: true }); }
    } else if (sub === "presence") {
      const text = interaction.options.getString("text");
      interaction.client.user.setPresence({ activities: [{ name: text, type: 3 }] });
      await interaction.reply({ content: `${config.ICONS.setting} Presence set to "${text}"`, ephemeral: true });
    }
  }
};

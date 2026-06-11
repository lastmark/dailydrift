const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const e = require("../emojis");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View the complete directory of interactive systems and features available."),

  async execute(interaction, client, redis) {
    await interaction.deferReply();

    // 1. Map out core top-level utility commands automatically
    const coreCommandsList = client.commands
      .filter(cmd => cmd.data.name !== "counting") // Separate out the counting tree for stylized layout
      .map(cmd => `• **/\`${cmd.data.name}\`** — *${cmd.data.description}*`)
      .join("\n") || "• *No general utilities registered.*";

    // 2. Build out explicit guides for your complex counting engine mechanics
    const countingModules = [
      `• **/\`counting balance\`**\n└ View your current wallet coin status and inventory shields.`,
      `• **/\`counting stats\`**\n└ Inspect your accuracy rates, total contributions, and sabotages.`,
      `• **/\`counting leaderboard\`**\n└ Open up the top 10 historical high scorers list in this guild.`,
      `• **/\`counting shop\`**\n└ Spend your earned currency to purchase protective assets.`
    ].join("\n\n");

    // 3. Compile the structural embed response
    const helpEmbed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setAuthor({ 
        name: `${client.user.username} Systems Protocol Directory`, 
        iconURL: client.user.displayAvatarURL() 
      })
      .setDescription(
        `Welcome to the central control node. Below is a detailed map of all standard system operations and mini-game submodules.\n\n` +
        `### ⚙️ Main Applications\n${coreCommandsList}\n\n` +
        `### ${e.coin || "🏆"} Infinite Counting Engine\n` +
        `Earn **5 coins** for every correct number added sequentially inside the designated zone. Use your profits inside the marketplace to buy streak-saving items.\n\n${countingModules}`
      )
      .addFields({
        name: `🛡️ Protection Assets: The Counting Shield`,
        value: `Stops a user-error reset dead in its tracks. If you input a wrong character/sequence while holding a shield, the system will break your item instead of deleting your entire server's progress record.`
      })
      .setFooter({ 
        text: `Developed with absolute structure • Public Build Node`, 
        iconURL: interaction.guild.iconURL() 
      });

    return await interaction.editReply({ embeds: [helpEmbed] });
  }
};

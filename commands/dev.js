const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dev")
    .setDescription("Developer only commands")
    .addSubcommand(sub => 
      sub.setName("status")
        .setDescription("Check bot status"))
    .addSubcommand(sub => 
      sub.setName("reload")
        .setDescription("Reload a command")
        .addStringOption(opt => 
          opt.setName("command")
            .setDescription("Command name to reload")
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName("servers")
        .setDescription("List all servers the bot is in"))
    .addSubcommand(sub =>
      sub.setName("eval")
        .setDescription("Execute JavaScript code")
        .addStringOption(opt =>
          opt.setName("code")
            .setDescription("Code to execute")
            .setRequired(true))),
  
  async execute(interaction, client, redis, devId) {
    // Dev-only check
    if (interaction.user.id !== devId) {
      return interaction.reply({ 
        content: "❌ You don't have permission to use this command.", 
        ephemeral: true 
      });
    }

    const subcommand = interaction.options.getSubcommand();

    // STATUS COMMAND
    if (subcommand === "status") {
      const uptime = Math.floor(client.uptime / 1000 / 60);
      const memory = process.memoryUsage().heapUsed / 1024 / 1024;
      
      const embed = new EmbedBuilder()
        .setTitle("🤖 Bot Status")
        .addFields(
          { name: "Uptime", value: `${uptime} minutes`, inline: true },
          { name: "Memory", value: `${memory.toFixed(2)} MB`, inline: true },
          { name: "Servers", value: `${client.guilds.cache.size}`, inline: true },
          { name: "Ping", value: `${Math.round(client.ws.ping)}ms`, inline: true }
        )
        .setColor(0x00ff00)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // RELOAD COMMAND
    else if (subcommand === "reload") {
      const commandName = interaction.options.getString("command");
      const commandPath = `./commands/${commandName}.js`;
      
      if (!fs.existsSync(commandPath)) {
        return interaction.reply({ 
          content: `❌ Command "${commandName}" not found!`, 
          ephemeral: true 
        });
      }
      
      try {
        delete require.cache[require.resolve(commandPath)];
        const newCommand = require(commandPath);
        client.commands.set(commandName, newCommand);
        
        await interaction.reply({ 
          content: `✅ Reloaded command: ${commandName}`, 
          ephemeral: true 
        });
      } catch (error) {
        await interaction.reply({ 
          content: `❌ Failed to reload: ${error.message}`, 
          ephemeral: true 
        });
      }
    }

    // SERVERS LIST COMMAND
    else if (subcommand === "servers") {
      const servers = client.guilds.cache.map(guild => 
        `**${guild.name}** - ${guild.memberCount} members (ID: ${guild.id})`
      ).join("\n");
      
      await interaction.reply({
        content: `**Bot is in ${client.guilds.cache.size} servers:**\n\n${servers.slice(0, 1900)}`,
        ephemeral: true
      });
    }

    // EVAL COMMAND (BE CAREFUL!)
    else if (subcommand === "eval") {
      const code = interaction.options.getString("code");
      try {
        let result = eval(code);
        if (typeof result !== "string") result = require("util").inspect(result);
        
        await interaction.reply({
          content: `📥 **Input:**\`\`\`js\n${code}\n\`\`\`\n📤 **Output:**\`\`\`js\n${result.slice(0, 1900)}\n\`\`\``,
          ephemeral: true
        });
      } catch (error) {
        await interaction.reply({
          content: `❌ **Error:**\`\`\`js\n${error}\n\`\`\``,
          ephemeral: true
        });
      }
    }
  }
};

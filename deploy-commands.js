const { REST, Routes } = require("discord.js");
const fs = require("fs");
require("dotenv").config();

const commands = [];

for (const file of fs.readdirSync("./commands")) {
  const cmd = require(`./commands/${file}`);
  commands.push(cmd.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("Refreshing slash commands...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("Slash commands fully refreshed.");
  } catch (err) {
    console.error(err);
  }
})();

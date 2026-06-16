const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ChannelType, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ComponentType
} = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("🪙 Play mini-games with interactive button panels.")
    .addSubcommand(sub =>
      sub.setName("rps").setDescription("Challenge the bot to an interactive Rock, Paper, Scissors match.")
    )
    .addSubcommand(sub =>
      sub.setName("coinflip").setDescription("Flip a currency token using buttons.")
    )
    .addSubcommand(sub =>
      sub.setName("dice").setDescription("Roll a standard six-sided cubic dice vector.")
    )
    .addSubcommand(sub =>
      sub.setName("counting").setDescription("⚙️ Set up the arithmetic counting game room (Admins Only).")
        .addChannelOption(opt => opt.setName("channel").setDescription("Target game channel").setRequired(true).addChannelTypes(ChannelType.GuildText))
    ),

  async execute(interaction, client, redis) {
    const subcommand = interaction.options.getSubcommand();

    // ─── MINI-GAME: ROCK, PAPER, SCISSORS (RPS) ───
    if (subcommand === "rps") {
      const initialEmbed = new EmbedBuilder()
        .setColor("#2B2D31")
        .setAuthor({ name: "Rock, Paper, Scissors Duel", iconURL: client.user.displayAvatarURL() })
        .setDescription(`${e.games || "🎮"} Select your choice weapon using the control grid below to match against the bot.`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("rps_rock").setLabel("Rock").setEmoji(e.rock || "🪨").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("rps_paper").setLabel("Paper").setEmoji(e.paper || "📄").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("rps_scissors").setLabel("Scissors").setEmoji(e.scissors || "✂️").setStyle(ButtonStyle.Danger)
      );

      const response = await interaction.reply({ embeds: [initialEmbed], components: [row], fetchReply: true });
      const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

      collector.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) {
          return await i.reply({ content: `${e.error || "❌"} This is not your match. Start your own duel using `/game rps`.`, ephemeral: true });
        }

        const userChoice = i.customId.split("_")[1];
        const botOptions = ["rock", "paper", "scissors"];
        const botChoice = botOptions[Math.floor(Math.random() * botOptions.length)];

        let finalResult = "";
        let finalIcon = e.info;
        if (userChoice === botChoice) finalResult = "It's a complete structural draw! 🤝";
        else if (
          (userChoice === "rock" && botChoice === "scissors") ||
          (userChoice === "paper" && botChoice === "rock") ||
          (userChoice === "scissors" && botChoice === "paper")
        ) {
          finalResult = "🏆 **You win!** You systematically dismantled my selection.";
          finalIcon = e.check;
        } else {
          finalResult = "🤖 **Bot wins!** Better luck next time, bro.";
          finalIcon = e.error;
        }

        const updateEmbed = new EmbedBuilder()
          .setColor("#2B2D31")
          .setAuthor({ name: "Match Terminated", iconURL: i.user.displayAvatarURL() })
          .setDescription(`${finalIcon || "🎯"} **Result:** ${finalResult}\n\n• **Your Play:** ${e[userChoice] || ""} \`${userChoice.toUpperCase()}\`\n• **Bot's Play:** ${e[botChoice] || ""} \`${botChoice.toUpperCase()}\``);

        const disabledRow = new ActionRowBuilder().addComponents(row.components.map(btn => ButtonBuilder.from(btn).setDisabled(true)));
        await i.update({ embeds: [updateEmbed], components: [disabledRow] });
        collector.stop();
      });

      collector.on("end", async (collected, reason) => {
        if (reason === "time") {
          const timedOutRow = new ActionRowBuilder().addComponents(row.components.map(btn => ButtonBuilder.from(btn).setDisabled(true)));
          await interaction.editReply({ content: `${e.error || "⏳"} Duel expired due to inactivity.`, components: [timedOutRow] }).catch(() => null);
        }
      });
    }

    // ─── MINI-GAME: COINFLIP ───
    if (subcommand === "coinflip") {
      const executeFlip = () => Math.random() > 0.5 ? "HEADS" : "TAILS";

      const flipEmbed = new EmbedBuilder()
        .setColor("#2B2D31")
        .setDescription(`${e.money || "🪙"} The token spins through the air and lands squarely on: **${executeFlip()}**`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("flip_again").setLabel("Flip Again").setEmoji(e.money || "🪙").setStyle(ButtonStyle.Secondary)
      );

      const response = await interaction.reply({ embeds: [flipEmbed], components: [row], fetchReply: true });
      const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

      collector.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) return await i.reply({ content: `${e.error || "❌"} Run \`/game coinflip\` to spin your own coin.`, ephemeral: true });

        const newFlipEmbed = new EmbedBuilder()
          .setColor("#2B2D31")
          .setDescription(`${e.money || "🪙"} The token spins through the air and lands squarely on: **${executeFlip()}**`);

        await i.update({ embeds: [newFlipEmbed] });
      });

      collector.on("end", async () => {
        const offRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(row.components[0]).setDisabled(true));
        await interaction.editReply({ components: [offRow] }).catch(() => null);
      });
    }

    // ─── MINI-GAME: DICE ROLL ───
    if (subcommand === "dice") {
      const executeRoll = () => Math.floor(Math.random() * 6) + 1;

      const diceEmbed = new EmbedBuilder()
        .setColor("#2B2D31")
        .setDescription(`${e.games || "🎲"} You cast the cubic dice and rolled a solid: **[ ${executeRoll()} ]**`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("roll_again").setLabel("Roll Again").setEmoji("🎲").setStyle(ButtonStyle.Secondary)
      );

      const response = await interaction.reply({ embeds: [diceEmbed], components: [row], fetchReply: true });
      const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

      collector.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) return await i.reply({ content: `${e.error || "❌"} Run \`/game dice\` to cast your own die.`, ephemeral: true });

        const newDiceEmbed = new EmbedBuilder()
          .setColor("#2B2D31")
          .setDescription(`${e.games || "🎲"} You cast the cubic dice and rolled a solid: **[ ${executeRoll()} ]**`);

        await i.update({ embeds: [newDiceEmbed] });
      });

      collector.on("end", async () => {
        const offRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(row.components[0]).setDisabled(true));
        await interaction.editReply({ components: [offRow] }).catch(() => null);
      });
    }

    // ─── CONFIG: COUNTING SETUP ───
    if (subcommand === "counting") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: `${e.error || "❌"} **Access Denied:** You need \`Manage Server\` permissions to set up gaming modules.`, ephemeral: true });
      }
      const channel = interaction.options.getChannel("channel");
      await redis.set(`counting_channel:${interaction.guild.id}`, channel.id);
      return interaction.reply({ content: `${e.check || "✅"} ${e.counting || "🪙"} **Counting Game Active:** The counting stream has been locked onto channel ${channel}.` });
    }
  }
};

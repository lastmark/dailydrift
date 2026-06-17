const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ChannelType, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ComponentType,
  MessageFlags
} = require("discord.js");
const e = require("../emojis.js");

module.exports = {
  category: "Games",
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
  sub.setName("tictactoe")
    .setDescription("Play Tic Tac Toe against a user or the bot.")
    .addUserOption(opt =>
      opt.setName("opponent")
        .setDescription("Leave empty to play against the bot")
        .setRequired(false)
    )
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

      const response = await interaction.reply({ embeds: [initialEmbed], components: [row], withResponse: true });
      const collector = response.resource.message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

      collector.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) {
          return await i.reply({ content: `${e.error || "❌"} This is not your match. Start your own duel using '/game rps'.`, flags: [MessageFlags.Ephemeral] });
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

      const response = await interaction.reply({ embeds: [flipEmbed], components: [row], withResponse: true });
      const collector = response.resource.message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

      collector.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) return await i.reply({ content: `${e.error || "❌"} Run \`/game coinflip\` to spin your own coin.`, flags: [MessageFlags.Ephemeral] });

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

      const response = await interaction.reply({ embeds: [diceEmbed], components: [row], withResponse: true });
      const collector = response.resource.message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

      collector.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) return await i.reply({ content: `${e.error || "❌"} Run \`/game dice\` to cast your own die.`, flags: [MessageFlags.Ephemeral] });

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
// ─── MINI-GAME: TIC TAC TOE ───
if (subcommand === "tictactoe") {
  const opponent = interaction.options.getUser("opponent");

  if (opponent?.bot) {
    return interaction.reply({
      content: `${e.error || "❌"} You cannot challenge bots.`,
      flags: [MessageFlags.Ephemeral]
    });
  }

  const board = Array(9).fill(null);
  const botGame = !opponent;

  let currentPlayer = interaction.user.id;
  let gameEnded = false;

  const createBoard = () => {
    const rows = [];

    for (let r = 0; r < 3; r++) {
      rows.push(
        new ActionRowBuilder().addComponents(
          ...Array.from({ length: 3 }, (_, c) => {
            const index = r * 3 + c;

            return new ButtonBuilder()
              .setCustomId(`ttt_${index}`)
              .setLabel(board[index] || "‎")
              .setStyle(
                board[index] === "X"
                  ? ButtonStyle.Danger
                  : board[index] === "O"
                  ? ButtonStyle.Primary
                  : ButtonStyle.Secondary
              )
              .setDisabled(board[index] !== null || gameEnded);
          })
        )
      );
    }

    return rows;
  };

  const winnerCheck = () => {
    const wins = [
      [0,1,2],[3,4,5],[6,7,8],
      [0,3,6],[1,4,7],[2,5,8],
      [0,4,8],[2,4,6]
    ];

    for (const [a,b,c] of wins) {
      if (
        board[a] &&
        board[a] === board[b] &&
        board[a] === board[c]
      ) {
        return board[a];
      }
    }

    if (!board.includes(null)) return "draw";

    return null;
  };

  const botMove = () => {
    const free = board
      .map((v, i) => (v === null ? i : null))
      .filter(v => v !== null);

    if (!free.length) return;

    const pick = free[Math.floor(Math.random() * free.length)];

    board[pick] = "O";
  };

  const embed = new EmbedBuilder()
    .setColor("#2B2D31")
    .setTitle("❌ Tic Tac Toe ⭕")
    .setDescription(
      botGame
        ? `**${interaction.user.username} (X)** vs **Bot (O)**`
        : `**${interaction.user.username} (X)** vs **${opponent.username} (O)**`
    );

  const response = await interaction.reply({
    embeds: [embed],
    components: createBoard(),
    withResponse: true
  });

  const collector =
    response.resource.message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000
    });

  collector.on("collect", async i => {
    const index = Number(i.customId.split("_")[1]);

    if (gameEnded) return;

    if (botGame) {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: "This isn't your game.",
          flags: [MessageFlags.Ephemeral]
        });
      }

      if (board[index] !== null) return;

      board[index] = "X";

      let result = winnerCheck();

      if (!result) {
        botMove();
        result = winnerCheck();
      }

      if (result) {
        gameEnded = true;

        const endEmbed = new EmbedBuilder()
          .setColor("#2B2D31")
          .setTitle("❌ Tic Tac Toe ⭕")
          .setDescription(
            result === "draw"
              ? "🤝 Draw!"
              : result === "X"
              ? "🏆 You Win!"
              : "🤖 Bot Wins!"
          );

        return i.update({
          embeds: [endEmbed],
          components: createBoard()
        });
      }

      return i.update({
        components: createBoard()
      });
    }

    if (
      (currentPlayer === interaction.user.id &&
        i.user.id !== interaction.user.id) ||
      (currentPlayer === opponent.id &&
        i.user.id !== opponent.id)
    ) {
      return i.reply({
        content: "It's not your turn.",
        flags: [MessageFlags.Ephemeral]
      });
    }

    if (board[index] !== null) return;

    board[index] =
      currentPlayer === interaction.user.id ? "X" : "O";

    const result = winnerCheck();

    if (result) {
      gameEnded = true;

      let text;

      if (result === "draw") {
        text = "🤝 Draw!";
      } else if (result === "X") {
        text = `🏆 ${interaction.user} wins!`;
      } else {
        text = `🏆 ${opponent} wins!`;
      }

      return i.update({
        embeds: [
          new EmbedBuilder()
            .setColor("#2B2D31")
            .setTitle("❌ Tic Tac Toe ⭕")
            .setDescription(text)
        ],
        components: createBoard()
      });
    }

    currentPlayer =
      currentPlayer === interaction.user.id
        ? opponent.id
        : interaction.user.id;

    await i.update({
      embeds: [
        new EmbedBuilder()
          .setColor("#2B2D31")
          .setTitle("❌ Tic Tac Toe ⭕")
          .setDescription(
            `Turn: <@${currentPlayer}>`
          )
      ],
      components: createBoard()
    });
  });

  collector.on("end", async () => {
    gameEnded = true;

    await interaction.editReply({
      components: createBoard()
    }).catch(() => null);
  });
}
    
    // ─── CONFIG: COUNTING SETUP ───
    if (subcommand === "counting") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: `${e.error || "❌"} **Access Denied:** You need \`Manage Server\` permissions to set up gaming modules.`, flags: [MessageFlags.Ephemeral] });
      }
      const channel = interaction.options.getChannel("channel");
      await redis.set(`counting_channel:${interaction.guild.id}`, channel.id);
      return interaction.reply({ content: `${e.check || "✅"} ${e.counting || "🪙"} **Counting Game Active:** The counting stream has been locked onto channel ${channel}.` });
    }
  }
};

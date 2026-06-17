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

const GAME_COLOR = "#5865F2";

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Arcade system with betting & rewards")
    .addSubcommand(s =>
      s.setName("rps").setDescription("Rock Paper Scissors")
        .addIntegerOption(o =>
          o.setName("bet").setDescription("Optional coin bet")
        )
    )
    .addSubcommand(s =>
      s.setName("coinflip").setDescription("Flip coin")
        .addIntegerOption(o =>
          o.setName("bet").setDescription("Optional bet")
        )
    )
    .addSubcommand(s =>
      s.setName("dice").setDescription("Roll dice")
        .addIntegerOption(o =>
          o.setName("bet").setDescription("Optional bet")
        )
    )
    .addSubcommand(s =>
      s.setName("tictactoe").setDescription("Play TicTacToe")
        .addUserOption(o =>
          o.setName("opponent").setDescription("Play vs user")
        )
        .addIntegerOption(o =>
          o.setName("bet").setDescription("Optional bet")
        )
    )
    .addSubcommand(s =>
      s.setName("counting").setDescription("Set counting channel")
        .addChannelOption(o =>
          o.setName("channel").setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // =========================
    // 💰 ECON HELPER
    // =========================
    const getBalance = async () =>
      Number(await redis.get(`eco:${guildId}:${userId}:money`) || 0);

    const addBalance = async (amt) =>
      await redis.incrby(`eco:${guildId}:${userId}:money`, amt);

    const takeBalance = async (amt) =>
      await redis.decrby(`eco:${guildId}:${userId}:money`, amt);

    const getStreak = async () =>
      Number(await redis.get(`game:${guildId}:${userId}:streak`) || 0);

    const addStreak = async (win) => {
      if (win) await redis.incr(`game:${guildId}:${userId}:streak`);
      else await redis.set(`game:${guildId}:${userId}:streak`, 0);
    };

    // =========================
    // 🎮 RPS
    // =========================
    if (sub === "rps") {
      const bet = interaction.options.getInteger("bet") || 0;
      const balance = await getBalance();

      if (bet > balance) {
        return interaction.reply({
          content: "❌ Not enough coins",
          flags: [MessageFlags.Ephemeral]
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("rps_rock").setLabel("Rock").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("rps_paper").setLabel("Paper").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("rps_scissors").setLabel("Scissors").setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(GAME_COLOR)
            .setDescription("Choose your move")
        ],
        components: [row],
        fetchReply: true
      });

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30000
      });

      collector.on("collect", async i => {
        if (i.user.id !== userId)
          return i.reply({ content: "Not your game", flags: [MessageFlags.Ephemeral] });

        const user = i.customId.split("_")[1];
        const bot = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];

        let win =
          user === bot ? null :
          (user === "rock" && bot === "scissors") ||
          (user === "paper" && bot === "rock") ||
          (user === "scissors" && bot === "paper");

        let reward = bet;

        if (bet > 0) {
          if (win === null) reward = 0;
          else if (win) reward = bet * 2;
          else reward = -bet;
        }

        if (reward > 0) await addBalance(reward);
        if (reward < 0) await takeBalance(Math.abs(reward));

        await addStreak(win);

        const embed = new EmbedBuilder()
          .setColor(GAME_COLOR)
          .setTitle("RPS Result")
          .setDescription(
            `${win === null ? "Draw" : win ? "Win" : "Lose"}\n\n` +
            `You: ${user}\nBot: ${bot}\n\n` +
            `💰 Change: ${reward >= 0 ? "+" : ""}${reward}`
          );

        const disabled = new ActionRowBuilder().addComponents(
          row.components.map(b => ButtonBuilder.from(b).setDisabled(true))
        );

        await i.update({ embeds: [embed], components: [disabled] });
        collector.stop();
      });
    }

    // =========================
    // 🪙 COINFLIP
    // =========================
    if (sub === "coinflip") {
      const bet = interaction.options.getInteger("bet") || 0;
      const balance = await getBalance();

      if (bet > balance)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const flip = () => (Math.random() > 0.5 ? "HEADS" : "TAILS");
      const result = flip();

      const win = result === "HEADS"; // simple logic (you can expand later)

      let reward = bet;
      if (bet > 0) reward = win ? bet * 2 : -bet;

      if (reward > 0) await addBalance(reward);
      if (reward < 0) await takeBalance(Math.abs(reward));

      await addStreak(win);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(GAME_COLOR)
            .setDescription(`🪙 ${result}\n\n💰 ${reward >= 0 ? "+" : ""}${reward}`)
        ]
      });
    }

    // =========================
    // 🎲 DICE
    // =========================
    if (sub === "dice") {
      const bet = interaction.options.getInteger("bet") || 0;
      const balance = await getBalance();

      if (bet > balance)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const roll = Math.floor(Math.random() * 6) + 1;
      const win = roll >= 4;

      let reward = 0;
      if (bet > 0) reward = win ? bet * 2 : -bet;

      if (reward > 0) await addBalance(reward);
      if (reward < 0) await takeBalance(Math.abs(reward));

      await addStreak(win);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(GAME_COLOR)
            .setDescription(`🎲 You rolled ${roll}\n💰 ${reward >= 0 ? "+" : ""}${reward}`)
        ]
      });
    }

    // =========================
    // ❌⭕ TIC TAC TOE
    // =========================
    if (sub === "tictactoe") {
      const opponent = interaction.options.getUser("opponent");
      const bet = interaction.options.getInteger("bet") || 0;

      const board = Array(9).fill(null);
      let ended = false;

      const check = () => {
        const w = [
          [0,1,2],[3,4,5],[6,7,8],
          [0,3,6],[1,4,7],[2,5,8],
          [0,4,8],[2,4,6]
        ];

        for (const [a,b,c] of w) {
          if (board[a] && board[a] === board[b] && board[a] === board[c])
            return board[a];
        }
        if (!board.includes(null)) return "draw";
        return null;
      };

      const render = () =>
        Array.from({ length: 3 }, (_, r) =>
          new ActionRowBuilder().addComponents(
            ...Array.from({ length: 3 }, (_, c) => {
              const i = r * 3 + c;

              return new ButtonBuilder()
                .setCustomId(`t_${i}`)
                .setLabel(board[i] || "‎")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!!board[i] || ended);
            })
          )
        );

      const msg = await interaction.reply({
        embeds: [new EmbedBuilder().setColor(GAME_COLOR).setTitle("TicTacToe")],
        components: render(),
        fetchReply: true
      });

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000
      });

      collector.on("collect", async i => {
        const idx = Number(i.customId.split("_")[1]);

        if (board[idx]) return;

        board[idx] = "X";

        const res = check();

        if (res) {
          ended = true;

          return i.update({
            embeds: [
              new EmbedBuilder()
                .setColor(GAME_COLOR)
                .setDescription(res === "draw" ? "Draw" : "Game Over")
            ],
            components: render()
          });
        }

        return i.update({ components: render() });
      });
    }

    // =========================
    // ⚙️ COUNTING SETUP
    // =========================
    if (sub === "counting") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: "No permission", flags: [MessageFlags.Ephemeral] });

      const channel = interaction.options.getChannel("channel");
      await redis.set(`counting_channel:${guildId}`, channel.id);

      return interaction.reply({
        content: `Counting set to ${channel}`
      });
    }
  }
};

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

/* =========================
   RANDOM RANGE HELPER
========================= */
const rand = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Arcade system with betting & rewards")
    .addSubcommand(s =>
      s.setName("rps")
        .setDescription("Rock Paper Scissors")
        .addIntegerOption(o =>
          o.setName("bet").setDescription("Optional coin bet")
        )
    )
    .addSubcommand(s =>
      s.setName("coinflip")
        .setDescription("Flip coin")
        .addIntegerOption(o =>
          o.setName("bet").setDescription("Optional bet")
        )
    )
    .addSubcommand(s =>
      s.setName("dice")
        .setDescription("Roll dice")
        .addIntegerOption(o =>
          o.setName("bet").setDescription("Optional bet")
        )
    )
    .addSubcommand(s =>
      s.setName("tictactoe")
        .setDescription("Play TicTacToe")
        .addUserOption(o =>
          o.setName("opponent").setDescription("Play vs user")
        )
        .addIntegerOption(o =>
          o.setName("bet").setDescription("Optional bet")
        )
    )
    .addSubcommand(s =>
      s.setName("counting")
        .setDescription("Set counting channel")
        .addChannelOption(o =>
          o.setName("channel")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(s =>
      s.setName("daily")
        .setDescription("Claim daily random coins reward")
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    /* =========================
       ECON HELPERS
    ========================= */
    const balanceKey = `eco:${guildId}:${userId}:money`;
    const dailyKey = `daily:${guildId}:${userId}`;

    const getBalance = async () =>
      Number((await redis.get(balanceKey)) || 0);

    const addBalance = async (amt) =>
      await redis.incrby(balanceKey, amt);

    const takeBalance = async (amt) =>
      await redis.decrby(balanceKey, amt);

    /* =========================
       DAILY SYSTEM
    ========================= */
    if (sub === "daily") {
      const claimed = await redis.get(dailyKey);

      if (claimed) {
        return interaction.reply({
          content: "⏳ You already claimed your daily reward.",
          flags: [MessageFlags.Ephemeral]
        });
      }

      const reward = rand(200, 1200);

      await addBalance(reward);
      await redis.set(dailyKey, "1", "EX", 86400);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(GAME_COLOR)
            .setTitle("🎁 Daily Reward Claimed")
            .setDescription(`You received **${reward} coins**`)
        ],
        flags: [MessageFlags.Ephemeral]
      });
    }

    /* =========================
       RPS
    ========================= */
    if (sub === "rps") {
      const bet = interaction.options.getInteger("bet") || 0;
      const balance = await getBalance();

      if (bet > balance)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("rock").setLabel("Rock").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("paper").setLabel("Paper").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("scissors").setLabel("Scissors").setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.reply({
        embeds: [
          new EmbedBuilder().setColor(GAME_COLOR).setDescription("Choose your move")
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

        const user = i.customId;
        const bot = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];

        let win =
          user === bot ? null :
          (user === "rock" && bot === "scissors") ||
          (user === "paper" && bot === "rock") ||
          (user === "scissors" && bot === "paper");

        let reward = bet;
        if (bet > 0) {
          reward = win === null ? 0 : win ? bet * 2 : -bet;
        }

        if (reward > 0) await addBalance(reward);
        if (reward < 0) await takeBalance(Math.abs(reward));

        const embed = new EmbedBuilder()
          .setColor(GAME_COLOR)
          .setDescription(
            `${win === null ? "Draw" : win ? "Win" : "Lose"}\nYou: ${user}\nBot: ${bot}\n💰 ${reward >= 0 ? "+" : ""}${reward}`
          );

        await i.update({
          embeds: [embed],
          components: []
        });

        collector.stop();
      });
    }

    /* =========================
       COINFLIP
    ========================= */
    if (sub === "coinflip") {
      const bet = interaction.options.getInteger("bet") || 0;
      const balance = await getBalance();

      if (bet > balance)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const result = Math.random() > 0.5 ? "HEADS" : "TAILS";
      const win = result === "HEADS";

      let reward = bet;
      if (bet > 0) reward = win ? bet * 2 : -bet;

      if (reward > 0) await addBalance(reward);
      if (reward < 0) await takeBalance(Math.abs(reward));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(GAME_COLOR)
            .setDescription(`🪙 ${result}\n💰 ${reward >= 0 ? "+" : ""}${reward}`)
        ]
      });
    }

    /* =========================
       DICE
    ========================= */
    if (sub === "dice") {
      const bet = interaction.options.getInteger("bet") || 0;
      const balance = await getBalance();

      if (bet > balance)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const roll = rand(1, 6);
      const win = roll >= 4;

      let reward = bet > 0 ? (win ? bet * 2 : -bet) : 0;

      if (reward > 0) await addBalance(reward);
      if (reward < 0) await takeBalance(Math.abs(reward));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(GAME_COLOR)
            .setDescription(`🎲 ${roll}\n💰 ${reward >= 0 ? "+" : ""}${reward}`)
        ]
      });
    }

    /* =========================
       COUNTING SETUP
    ========================= */
    if (sub === "counting") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({
          content: "No permission",
          flags: [MessageFlags.Ephemeral]
        });

      const channel = interaction.options.getChannel("channel");
      await redis.set(`counting_channel:${guildId}`, channel.id);

      return interaction.reply({ content: `Counting set to ${channel}` });
    }
  }
};

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

const GAME_COLOR = "#5865F2";

const rand = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

module.exports = {
  category: "Games",

  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Arcade system with economy")
    .addSubcommand(s =>
      s.setName("balance").setDescription("View your wallet")
    )
    .addSubcommand(s =>
      s.setName("daily").setDescription("Claim daily coins")
    )
    .addSubcommand(s =>
      s.setName("rps").setDescription("Rock Paper Scissors")
        .addIntegerOption(o => o.setName("bet").setDescription("Optional bet"))
    )
    .addSubcommand(s =>
      s.setName("coinflip").setDescription("Flip coin")
        .addIntegerOption(o => o.setName("bet").setDescription("Optional bet"))
    )
    .addSubcommand(s =>
      s.setName("dice").setDescription("Roll dice")
        .addIntegerOption(o => o.setName("bet").setDescription("Optional bet"))
    ),

  async execute(interaction, client, redis) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const eco = (type) => `eco:${guildId}:${userId}:${type}`;

    const getMoney = async () =>
      Number((await redis.get(eco("money"))) || 0);

    const addMoney = (amt) =>
      redis.incrby(eco("money"), amt);

    const takeMoney = (amt) =>
      redis.decrby(eco("money"), amt);

    /* =========================
       💰 BALANCE (MAIN SYSTEM)
    ========================= */
    if (sub === "balance") {
      const coins = await getMoney();
      const shields = Number(await redis.get(eco("shield")) || 0);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(GAME_COLOR)
            .setAuthor({
              name: `${interaction.user.username}'s Wallet`,
              iconURL: interaction.user.displayAvatarURL()
            })
            .addFields(
              { name: "💰 Coins", value: `\`${coins}\``, inline: true },
              { name: "🛡️ Shields", value: `\`${shields}\``, inline: true }
            )
        ]
      });
    }

    /* =========================
       🎁 DAILY (MAX 100)
    ========================= */
    if (sub === "daily") {
      const key = `daily:${guildId}:${userId}`;
      const claimed = await redis.get(key);

      if (claimed) {
        return interaction.reply({
          content: "⏳ Already claimed daily.",
          flags: [MessageFlags.Ephemeral]
        });
      }

      const reward = rand(10, 100);

      await addMoney(reward);
      await redis.set(key, "1", "EX", 86400);

      return interaction.reply({
        content: `🎁 You got **${reward} coins**!`,
        flags: [MessageFlags.Ephemeral]
      });
    }

    /* =========================
       🎮 RPS
    ========================= */
    if (sub === "rps") {
      const bet = interaction.options.getInteger("bet") || 0;
      const bal = await getMoney();

      if (bet > bal)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("rock").setLabel("Rock").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("paper").setLabel("Paper").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("scissors").setLabel("Scissors").setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.reply({
        embeds: [new EmbedBuilder().setColor(GAME_COLOR).setDescription("Choose move")],
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

        let reward = bet > 0 ? (win === null ? 0 : win ? bet * 2 : -bet) : 0;

        if (reward > 0) await addMoney(reward);
        if (reward < 0) await takeMoney(Math.abs(reward));

        await i.update({
          embeds: [
            new EmbedBuilder()
              .setColor(GAME_COLOR)
              .setDescription(`You: ${user}\nBot: ${bot}\nResult: ${win === null ? "Draw" : win ? "Win" : "Lose"}\n💰 ${reward >= 0 ? "+" : ""}${reward}`)
          ],
          components: []
        });

        collector.stop();
      });
    }

    /* =========================
       🎲 DICE
    ========================= */
    if (sub === "dice") {
      const bet = interaction.options.getInteger("bet") || 0;
      const bal = await getMoney();

      if (bet > bal)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const roll = rand(1, 6);
      const win = roll >= 4;

      let reward = bet > 0 ? (win ? bet * 2 : -bet) : 0;

      if (reward > 0) await addMoney(reward);
      if (reward < 0) await takeMoney(Math.abs(reward));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(GAME_COLOR)
            .setDescription(`🎲 Rolled ${roll}\n💰 ${reward >= 0 ? "+" : ""}${reward}`)
        ]
      });
    }

    /* =========================
       🪙 COINFLIP
    ========================= */
    if (sub === "coinflip") {
      const bet = interaction.options.getInteger("bet") || 0;
      const bal = await getMoney();

      if (bet > bal)
        return interaction.reply({ content: "❌ Not enough coins", flags: [MessageFlags.Ephemeral] });

      const result = Math.random() > 0.5 ? "HEADS" : "TAILS";
      const win = result === "HEADS";

      let reward = bet > 0 ? (win ? bet * 2 : -bet) : 0;

      if (reward > 0) await addMoney(reward);
      if (reward < 0) await takeMoney(Math.abs(reward));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(GAME_COLOR)
            .setDescription(`🪙 ${result}\n💰 ${reward >= 0 ? "+" : ""}${reward}`)
        ]
      });
    }
  }
};

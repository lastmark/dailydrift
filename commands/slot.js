async execute(interaction, client, redis) {
    const userId = interaction.user.id;
    const betRaw = interaction.options.getString("bet").toLowerCase();
    let bet;

    const balanceKey = `eco:${userId}:money`;
    const currentBal = Number(await redis.get(balanceKey) || 0);

    // ---- Parse bet (unchanged) ----
    if (betRaw === "all") {
      bet = Math.min(currentBal, MAX_BET);
      if (bet <= 0) {
        return interaction.reply({ content: "❌ You have no coins.", flags: MessageFlags.Ephemeral });
      }
    } else {
      bet = parseInt(betRaw);
      if (isNaN(bet) || bet < 1) {
        return interaction.reply({ content: "❌ Please enter a number or 'all'.", flags: MessageFlags.Ephemeral });
      }
      if (bet > MAX_BET) bet = MAX_BET;
    }

    if (currentBal < bet) {
      return interaction.reply({
        content: `❌ You need **${bet.toLocaleString()}** coins, but you have **${currentBal.toLocaleString()}**.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // ---- Lock (unchanged) ----
    const lockKey = `slots:lock:${userId}`;
    if (await redis.get(lockKey)) {
      return interaction.reply({ content: "⏳ You already have a spin in progress.", flags: MessageFlags.Ephemeral });
    }
    await redis.set(lockKey, "1", "EX", 5);
    await redis.set(balanceKey, currentBal - bet);

    const { multiplier, symbols, winText } = getOutcome(bet);
    const payout = bet * multiplier;

    // ---- Defer the reply FIRST ----
    try {
      await interaction.deferReply();

      const spin = SLOT_SPIN_EMOJI;
      const baseEmbed = () => new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("🎰 SLOTS")
        .setFooter({ text: `Bet: ${bet.toLocaleString()} coins` });

      // Frame 1
      await interaction.editReply({
        embeds: [
          baseEmbed()
            .setDescription(`[ ${spin} │ ${spin} │ ${spin} ]`)
            .setFooter({ text: `Bet: ${bet.toLocaleString()} coins · Spinning...` })
        ]
      }).catch(() => {});
      await sleep(1000);

      // Frame 2
      await interaction.editReply({
        embeds: [
          baseEmbed()
            .setDescription(`[ ${symbols[0]} │ ${spin} │ ${spin} ]`)
            .setFooter({ text: `Bet: ${bet.toLocaleString()} coins · Spinning...` })
        ]
      }).catch(() => {});
      await sleep(700);

      // Frame 3
      await interaction.editReply({
        embeds: [
          baseEmbed()
            .setDescription(`[ ${symbols[0]} │ ${spin} │ ${symbols[2]} ]`)
            .setFooter({ text: `Bet: ${bet.toLocaleString()} coins · Almost there...` })
        ]
      }).catch(() => {});
      await sleep(1000);

      // Final frame
      let resultColor, resultText;
      if (multiplier === 0) {
        resultColor = "#ED4245";
        resultText = `You lost **${bet.toLocaleString()}** coins.\n${winText}`;
      } else if (multiplier === 10) {
        resultColor = "#FFD700";
        resultText = `🎉 **JACKPOT!** You won **${payout.toLocaleString()}** coins!\n${winText}`;
      } else {
        resultColor = "#57F287";
        resultText = `You won **${payout.toLocaleString()}** coins!\n${winText}`;
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(resultColor)
            .setTitle("🎰 SLOTS")
            .setDescription(`[ ${symbols[0]} │ ${symbols[1]} │ ${symbols[2]} ]\n\n${resultText}`)
            .setFooter({ text: `Bet: ${bet.toLocaleString()} coins` })
        ]
      }).catch(() => {});

      // Pay out
      if (payout > 0) {
        const newBal = Number(await redis.get(balanceKey) || 0) + payout;
        await redis.set(balanceKey, newBal);
      }
    } catch (err) {
      console.error("Slots error:", err);
      // If we never replied, send a follow-up
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: "❌ An error occurred during the spin." });
        } else {
          await interaction.followUp({ content: "❌ An error occurred during the spin." });
        }
      } catch (e) {
        // ignore
      }
    } finally {
      await redis.del(lockKey);
    }
  }

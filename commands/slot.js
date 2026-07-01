// commands/slots.js – Premium Slots Engine (MongoDB Optimized)
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

const MAX_BET = 250_000;
const SYMBOLS = ["🍎", "🍊", "🍋", "🍇", "🍒", "🍓"];
const SLOT_SPIN_EMOJI = "<a:slot:1520527576186097845>";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getOutcome(bet) {
  const r = Math.random() * 100;
  if (r <= 20) return { multiplier: 1, symbols: [SYMBOLS[0], SYMBOLS[0], SYMBOLS[0]], winText: "Even money! You get your bet back." };
  if (r <= 40) return { multiplier: 2, symbols: [SYMBOLS[1], SYMBOLS[1], SYMBOLS[1]], winText: "Double up!" };
  if (r <= 45) return { multiplier: 3, symbols: [SYMBOLS[2], SYMBOLS[2], SYMBOLS[2]], winText: "Triple win!" };
  if (r <= 47.5) return { multiplier: 4, symbols: [SYMBOLS[3], SYMBOLS[3], SYMBOLS[3]], winText: "Big win! 4x!" };
  if (r <= 48.5) return { multiplier: 10, symbols: [SYMBOLS[4], SYMBOLS[5], SYMBOLS[4]], winText: "JACKPOT! 10x!" };
  
  const a = Math.floor(Math.random() * SYMBOLS.length);
  let b = Math.floor(Math.random() * SYMBOLS.length);
  if (b === a) b = (a + 1) % SYMBOLS.length;
  let c = Math.floor(Math.random() * SYMBOLS.length);
  if (c === a) c = (a + 2) % SYMBOLS.length;
  return { multiplier: 0, symbols: [SYMBOLS[a], SYMBOLS[b], SYMBOLS[c]], winText: "No luck..." };
}

module.exports = {
  category: "Games",
  data: new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Spin the slot machine for premium rewards")
    .addStringOption(opt => opt.setName("bet").setDescription("Amount to bet or 'all'").setRequired(true)),

  async execute(interaction, client, db) {
    const userId = interaction.user.id;
    const betRaw = interaction.options.getString("bet").toLowerCase();
    
    // Ledger Sync
    const currentBal = Number(await db.get(`eco:${userId}:money`) || 0);
    let bet = betRaw === "all" ? Math.min(currentBal, MAX_BET) : parseInt(betRaw);

    if (isNaN(bet) || bet < 1) return interaction.reply({ content: "❌ Invalid wager.", flags: MessageFlags.Ephemeral });
    if (bet > MAX_BET) bet = MAX_BET;
    if (currentBal < bet) return interaction.reply({ content: `❌ Insufficient funds. Balance: **${currentBal.toLocaleString()}**`, flags: MessageFlags.Ephemeral });

    // Concurrency Lock: MongoDB check
    const lockKey = `slots:lock:${userId}`;
    if (await db.get(lockKey)) return interaction.reply({ content: "⏳ Spin in progress.", flags: MessageFlags.Ephemeral });
    
    await db.set(lockKey, true); // Lock session
    await db.set(`eco:${userId}:money`, currentBal - bet); // Deduct

    try {
      await interaction.deferReply();
      const { multiplier, symbols, winText } = getOutcome(bet);
      const payout = bet * multiplier;

      const baseEmbed = () => new EmbedBuilder().setColor("#0A0A0A").setTitle("🎰 SLOT ENGINE").setFooter({ text: `Wager: ${bet.toLocaleString()}` });

      // Animation Frames
      await interaction.editReply({ embeds: [baseEmbed().setDescription(`[ ${SLOT_SPIN_EMOJI} │ ${SLOT_SPIN_EMOJI} │ ${SLOT_SPIN_EMOJI} ]`)] });
      await sleep(1000);
      await interaction.editReply({ embeds: [baseEmbed().setDescription(`[ ${symbols[0]} │ ${SLOT_SPIN_EMOJI} │ ${SLOT_SPIN_EMOJI} ]`)] });
      await sleep(700);
      await interaction.editReply({ embeds: [baseEmbed().setDescription(`[ ${symbols[0]} │ ${SLOT_SPIN_EMOJI} │ ${symbols[2]} ]`)] });
      await sleep(1000);

      const color = multiplier === 0 ? "#BA1A1A" : (multiplier === 10 ? "#FFD700" : "#57F287");
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(color).setTitle("🎰 SLOT ENGINE").setDescription(`[ ${symbols[0]} │ ${symbols[1]} │ ${symbols[2]} ]\n\n${multiplier > 0 ? `🎉 **WIN:** ${payout.toLocaleString()}` : winText}`)]
      });

      if (payout > 0) {
        const newBal = Number(await db.get(`eco:${userId}:money`) || 0) + payout;
        await db.set(`eco:${userId}:money`, newBal);
      }
    } catch (err) {
      console.error("Slots engine fault:", err);
    } finally {
      await db.del(lockKey); // Release lock
    }
  }
};

// Inside the button interaction handler for rps_accept_
const challenge = await rps.getChallenge(challengeId);
if (!challenge) return interaction.reply({ content: `${config.ICONS.error} Challenge expired.`, ephemeral: true });
// Then show choices with icons
const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`rps_choice_${challengeId}_rock`).setLabel(`${config.ICONS.rock} Rock`).setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`rps_choice_${challengeId}_paper`).setLabel(`${config.ICONS.paper} Paper`).setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`rps_choice_${challengeId}_scissors`).setLabel(`${config.ICONS.scissor} Scissors`).setStyle(ButtonStyle.Primary)
);
await interaction.reply({ content: `${config.ICONS.announce} Choose your move:`, components: [row] });

// utils/ticketUtils.js
async function createTranscript(channel, client) {
  let transcript = `Transcript for ${channel.name}\n`;
  transcript += `Created: ${new Date().toLocaleString()}\n\n`;

  try {
    const messages = await channel.messages.fetch({ limit: 100, order: 'asc' });
    for (const [id, msg] of messages) {
      const time = msg.createdAt.toLocaleString();
      const author = msg.author.tag;
      const content = msg.content || "(No text content)";
      transcript += `[${time}] ${author}: ${content}\n`;
    }
  } catch (error) {
    transcript += `\nError fetching messages: ${error.message}`;
  }

  return transcript;
}

module.exports = { createTranscript };

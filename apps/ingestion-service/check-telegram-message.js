require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const apiId = parseInt(process.env.INGESTION_TELEGRAM_MTPROTO_API_ID);
const apiHash = process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH;
const session = process.env.INGESTION_TELEGRAM_MTPROTO_SESSION;

console.log('API ID:', apiId);
console.log('Has session:', !!session);

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });

(async () => {
  await client.connect();
  const messages = await client.getMessages('-1004466661332', { limit: 5 });
  console.log('Last 5 messages from Test Ingestion (-1004466661332):');
  messages.forEach(m => {
    console.log('---');
    console.log('ID:', m.id);
    console.log('Text:', m.message || '(empty)');
    console.log('Has media:', !!m.media);
    if (m.message && m.message.includes('Ethena')) {
      console.log('>>> FOUND MESSAGE WITH "Ethena"');
    }
  });
  process.exit(0);
})();

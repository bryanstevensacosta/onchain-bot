require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const apiId = parseInt(process.env.INGESTION_TELEGRAM_MTPROTO_API_ID);
const apiHash = process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH;
const session = process.env.INGESTION_TELEGRAM_MTPROTO_SESSION;

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });

(async () => {
  await client.connect();
  const messages = await client.getMessages('-1004466661332', { ids: [147, 146, 143] });
  
  for (const msg of messages) {
    console.log(`\n=== Mensaje ${msg.id} ===`);
    console.log('message field:', msg.message || '(empty)');
    console.log('Has media:', !!msg.media);
    if (msg.media) {
      console.log('Media type:', msg.media.className);
      console.log('Media caption (if any):', msg.media.caption || '(no caption field)');
      console.log('Media keys:', Object.keys(msg.media).join(', '));
    }
  }
  
  process.exit(0);
})();

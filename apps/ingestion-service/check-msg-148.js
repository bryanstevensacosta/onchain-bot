require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const apiId = parseInt(process.env.INGESTION_TELEGRAM_MTPROTO_API_ID);
const apiHash = process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH;
const session = process.env.INGESTION_TELEGRAM_MTPROTO_SESSION;

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });

(async () => {
  await client.connect();
  const [msg] = await client.getMessages('-1004466661332', { ids: [148] });
  console.log('Message 148:');
  console.log('  text:', msg.message || '(empty)');
  console.log('  has media:', !!msg.media);
  console.log('  media type:', msg.media?.className || 'N/A');
  
  if (msg.media) {
    console.log('  media keys:', Object.keys(msg.media).join(', '));
    if (msg.media.photo) console.log('  → has photo');
    if (msg.media.document) console.log('  → has document/video');
  }
  
  process.exit(0);
})();

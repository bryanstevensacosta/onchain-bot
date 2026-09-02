require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const apiId = parseInt(process.env.INGESTION_TELEGRAM_MTPROTO_API_ID);
const apiHash = process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH;
const session = process.env.INGESTION_TELEGRAM_MTPROTO_SESSION;

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });

(async () => {
  await client.connect();
  
  // Check messages 147 (empty) and 146 (with text)
  const messages = await client.getMessages('-1004466661332', { ids: [147, 146, 142, 143] });
  
  for (const msg of messages) {
    console.log(`\n=== Message ${msg.id} ===`);
    console.log(`message: "${msg.message || '(empty)'}"`);
    console.log(`_text: "${msg._text || '(empty)'}"`);
    console.log(`text property: ${msg.text ? `"${msg.text}"` : '(undefined)'}`);
    
    // Try to access all text-related properties
    if (msg.message !== msg._text) {
      console.log(`⚠️ MISMATCH: message !== _text`);
    }
    
    // Check if there's a method to get text
    if (typeof msg.getText === 'function') {
      try {
        const methodText = msg.getText();
        console.log(`getText() method: "${methodText}"`);
      } catch (e) {
        console.log(`getText() failed: ${e.message}`);
      }
    }
  }
  
  process.exit(0);
})();

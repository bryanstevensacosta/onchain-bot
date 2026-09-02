require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const apiId = parseInt(process.env.INGESTION_TELEGRAM_MTPROTO_API_ID);
const apiHash = process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH;
const session = process.env.INGESTION_TELEGRAM_MTPROTO_SESSION;

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });

(async () => {
  await client.connect();
  
  // Check empty messages to see if they are forwarded
  const messages = await client.getMessages('-1004466661332', { ids: [147, 142, 141, 140, 138] });
  
  for (const msg of messages) {
    console.log(`\n=== Message ${msg.id} ===`);
    console.log(`message: "${msg.message || '(empty)'}"`);
    console.log(`Is forwarded: ${!!msg.fwdFrom}`);
    
    if (msg.fwdFrom) {
      console.log(`Forward from:`);
      console.log(`  - fromId: ${msg.fwdFrom.fromId}`);
      console.log(`  - fromName: ${msg.fwdFrom.fromName || '(no name)'}`);
      console.log(`  - channelPost: ${msg.fwdFrom.channelPost || 'N/A'}`);
    }
    
    console.log(`Has media: ${!!msg.media}`);
    console.log(`Media type: ${msg.media?.className || 'N/A'}`);
    
    // Check ALL properties of the message object
    const allProps = Object.keys(msg);
    console.log(`Total properties: ${allProps.length}`);
    
    // Look for any property that might contain text
    const suspectProps = allProps.filter(p => 
      p.toLowerCase().includes('text') || 
      p.toLowerCase().includes('caption') ||
      p.toLowerCase().includes('message') ||
      p.toLowerCase().includes('content')
    );
    
    if (suspectProps.length > 0) {
      console.log(`Suspect properties: ${suspectProps.join(', ')}`);
      suspectProps.forEach(prop => {
        const val = msg[prop];
        if (val && typeof val === 'string' && val.length > 0) {
          console.log(`  ${prop}: "${val.substring(0, 100)}..."`);
        } else if (val && typeof val === 'object') {
          console.log(`  ${prop}: [object ${val.constructor?.name || 'Unknown'}]`);
        }
      });
    }
  }
  
  process.exit(0);
})();

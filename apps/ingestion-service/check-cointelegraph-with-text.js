require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const apiId = parseInt(process.env.INGESTION_TELEGRAM_MTPROTO_API_ID);
const apiHash = process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH;
const session = process.env.INGESTION_TELEGRAM_MTPROTO_SESSION;

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });

(async () => {
  await client.connect();
  
  // Get latest messages from Cointelegraph
  console.log('=== Cointelegraph Channel (-1001072723547) ===\n');
  
  const messages = await client.getMessages('-1001072723547', { limit: 10 });
  
  let withText = 0;
  let withoutText = 0;
  let withMedia = 0;
  
  messages.forEach((msg, i) => {
    const hasText = !!msg.message && msg.message.length > 0;
    const hasMedia = !!msg.media;
    
    if (hasText) withText++;
    else withoutText++;
    if (hasMedia) withMedia++;
    
    console.log(`--- Message ${msg.id} ---`);
    console.log(`Has text: ${hasText ? 'YES' : 'NO'} (${msg.message?.length || 0} chars)`);
    console.log(`Has media: ${hasMedia ? 'YES' : 'NO'} ${hasMedia ? `(${msg.media.className})` : ''}`);
    
    if (hasText) {
      console.log(`Text preview: "${msg.message.substring(0, 100)}..."`);
    }
    
    if (hasMedia) {
      // Check for video
      if (msg.media.document) {
        const videoAttr = msg.media.document.attributes?.find(a => a.className === 'DocumentAttributeVideo');
        if (videoAttr) {
          console.log(`  → Video: ${videoAttr.w}x${videoAttr.h}, duration: ${videoAttr.duration}s`);
        }
      }
      
      // Check for photo
      if (msg.media.photo) {
        console.log(`  → Photo`);
      }
    }
    
    console.log('');
  });
  
  console.log(`\n=== Summary ===`);
  console.log(`Total messages: ${messages.length}`);
  console.log(`With text: ${withText}`);
  console.log(`Without text: ${withoutText}`);
  console.log(`With media: ${withMedia}`);
  
  process.exit(0);
})();

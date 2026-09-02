require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const apiId = parseInt(process.env.INGESTION_TELEGRAM_MTPROTO_API_ID);
const apiHash = process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH;
const session = process.env.INGESTION_TELEGRAM_MTPROTO_SESSION;

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });

(async () => {
  await client.connect();
  
  // Get last 10 messages from Test Ingestion
  const messages = await client.getMessages('-1004466661332', { limit: 10 });
  
  console.log(`\n=== Last 10 messages from Test Ingestion (-1004466661332) ===\n`);
  
  for (const msg of messages) {
    console.log(`--- Message ${msg.id} ---`);
    console.log(`Date: ${msg.date ? new Date(msg.date * 1000).toISOString() : 'N/A'}`);
    console.log(`message field: "${msg.message || '(empty)'}"`);
    console.log(`message length: ${msg.message?.length || 0}`);
    console.log(`Has media: ${!!msg.media}`);
    
    if (msg.media) {
      console.log(`Media type: ${msg.media.className}`);
      
      // Check if media has caption in different possible locations
      if (msg.media.caption) {
        console.log(`Media.caption: "${msg.media.caption}"`);
      }
      
      // For documents/videos
      if (msg.media.document) {
        console.log(`Has document/video: true`);
        if (msg.media.document.attributes) {
          const videoAttr = msg.media.document.attributes.find(a => a.className === 'DocumentAttributeVideo');
          if (videoAttr) {
            console.log(`Video dimensions: ${videoAttr.w}x${videoAttr.h}`);
          }
        }
      }
      
      // For photos
      if (msg.media.photo) {
        console.log(`Has photo: true`);
      }
    }
    
    // Check all message properties
    const allKeys = Object.keys(msg);
    const textKeys = allKeys.filter(k => k.toLowerCase().includes('text') || k.toLowerCase().includes('caption'));
    if (textKeys.length > 0) {
      console.log(`Text-related keys found: ${textKeys.join(', ')}`);
      textKeys.forEach(key => {
        if (msg[key] && typeof msg[key] === 'string') {
          console.log(`  ${key}: "${msg[key]}"`);
        }
      });
    }
    
    console.log('');
  }
  
  process.exit(0);
})();

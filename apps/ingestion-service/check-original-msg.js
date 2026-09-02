require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

const apiId = parseInt(process.env.INGESTION_TELEGRAM_MTPROTO_API_ID);
const apiHash = process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH;
const session = process.env.INGESTION_TELEGRAM_MTPROTO_SESSION;

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });

(async () => {
  await client.connect();
  
  // Get forwarded message 147
  const [msg147] = await client.getMessages('-1004466661332', { ids: [147] });
  
  console.log(`=== Forwarded Message 147 ===`);
  console.log(`message field: "${msg147.message || '(empty)'}"`);
  console.log(`Is forwarded: ${!!msg147.fwdFrom}`);
  
  if (msg147.fwdFrom) {
    console.log(`\nForward info:`);
    console.log(`  fromId type: ${msg147.fwdFrom.fromId?.className}`);
    console.log(`  channelPost: ${msg147.fwdFrom.channelPost}`);
    
    // Extract channel ID from fwdFrom.fromId
    const channelPeer = msg147.fwdFrom.fromId;
    console.log(`  Full fromId:`, channelPeer);
    
    if (channelPeer && channelPeer.channelId) {
      const originalChannelId = `-100${channelPeer.channelId}`;
      const originalMessageId = msg147.fwdFrom.channelPost;
      
      console.log(`\n=== Trying to fetch original message ===`);
      console.log(`Channel: ${originalChannelId}`);
      console.log(`Message ID: ${originalMessageId}`);
      
      try {
        const originalMessages = await client.getMessages(originalChannelId, { ids: [originalMessageId] });
        const originalMsg = originalMessages[0];
        
        console.log(`\n=== Original Message ===`);
        console.log(`message field: "${originalMsg.message || '(empty)'}"`);
        console.log(`Has media: ${!!originalMsg.media}`);
        console.log(`Media type: ${originalMsg.media?.className || 'N/A'}`);
        
        if (originalMsg.message) {
          console.log(`\n✅ FOUND TEXT IN ORIGINAL MESSAGE!`);
          console.log(`Text length: ${originalMsg.message.length}`);
          console.log(`Text preview: "${originalMsg.message.substring(0, 200)}..."`);
        } else {
          console.log(`\n❌ Original message also has no text`);
        }
      } catch (error) {
        console.log(`\n❌ Failed to fetch original message: ${error.message}`);
      }
    }
  }
  
  process.exit(0);
})();

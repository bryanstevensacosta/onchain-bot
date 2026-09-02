require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const apiId = parseInt(process.env.INGESTION_TELEGRAM_MTPROTO_API_ID);
const apiHash = process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH;
const session = process.env.INGESTION_TELEGRAM_MTPROTO_SESSION;

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });

(async () => {
  await client.connect();
  
  // Check original Cointelegraph message (channel -1001072723547, message 70828)
  // This is the message that was forwarded as message 147 in Test Ingestion
  
  console.log(`=== Checking Cointelegraph Channel ===`);
  console.log(`Channel ID: -1001072723547`);
  console.log(`Message ID: 70828\n`);
  
  try {
    const messages = await client.getMessages('-1001072723547', { ids: [70828] });
    const msg = messages[0];
    
    if (!msg) {
      console.log('❌ Could not fetch message 70828 from Cointelegraph');
      process.exit(1);
    }
    
    console.log(`=== Original Cointelegraph Message 70828 ===`);
    console.log(`message field: "${msg.message || '(empty)'}"`);
    console.log(`message length: ${msg.message?.length || 0}`);
    console.log(`Has media: ${!!msg.media}`);
    console.log(`Media type: ${msg.media?.className || 'N/A'}`);
    
    if (msg.media) {
      console.log(`\nMedia details:`);
      const mediaKeys = Object.keys(msg.media);
      console.log(`  Keys: ${mediaKeys.join(', ')}`);
      
      // Check for webpage
      if (msg.media.webpage) {
        console.log(`\n  📄 Has webpage:`);
        console.log(`    type: ${msg.media.webpage.type || 'N/A'}`);
        console.log(`    title: ${msg.media.webpage.title || 'N/A'}`);
        console.log(`    description: ${msg.media.webpage.description || 'N/A'}`);
        console.log(`    url: ${msg.media.webpage.url || 'N/A'}`);
      }
      
      // Check for photo
      if (msg.media.photo) {
        console.log(`\n  📷 Has photo: true`);
      }
      
      // Check for document
      if (msg.media.document) {
        console.log(`\n  📎 Has document: true`);
      }
    }
    
    // Check if message has entities (formatting, links, etc)
    if (msg.entities && msg.entities.length > 0) {
      console.log(`\n  Has entities: ${msg.entities.length}`);
      msg.entities.forEach((entity, i) => {
        console.log(`    ${i + 1}. ${entity.className} at offset ${entity.offset}, length ${entity.length}`);
      });
    }
    
    console.log(`\n=== Now checking the FORWARDED message in Test Ingestion ===`);
    
    const fwdMessages = await client.getMessages('-1004466661332', { ids: [147] });
    const fwdMsg = fwdMessages[0];
    
    console.log(`\nForwarded message 147:`);
    console.log(`  message field: "${fwdMsg.message || '(empty)'}"`);
    console.log(`  message length: ${fwdMsg.message?.length || 0}`);
    console.log(`  Has media: ${!!fwdMsg.media}`);
    console.log(`  Media type: ${fwdMsg.media?.className || 'N/A'}`);
    
    if (fwdMsg.media && fwdMsg.media.webpage) {
      console.log(`\n  📄 Forwarded has webpage:`);
      console.log(`    type: ${fwdMsg.media.webpage.type || 'N/A'}`);
      console.log(`    title: ${fwdMsg.media.webpage.title || 'N/A'}`);
      console.log(`    description: ${fwdMsg.media.webpage.description || 'N/A'}`);
    }
    
    console.log(`\n=== Summary ===`);
    if (msg.message && !fwdMsg.message) {
      console.log(`❌ TEXT WAS LOST during forward!`);
      console.log(`   Original had: "${msg.message.substring(0, 100)}..."`);
      console.log(`   Forwarded has: (empty)`);
    } else if (!msg.message && !fwdMsg.message) {
      console.log(`ℹ️  Both original and forwarded have no text in 'message' field`);
    } else if (msg.message && fwdMsg.message) {
      console.log(`✅ Text preserved during forward`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  
  process.exit(0);
})();

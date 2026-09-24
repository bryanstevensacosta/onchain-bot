import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

function readArg(name: string): string | undefined {
  const prefixed = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefixed)) return arg.slice(prefixed.length);
  }
  return undefined;
}

async function checkMessage() {
  const apiId = parseInt(
    process.env.INGESTION_TELEGRAM_MTPROTO_API_ID ||
      process.env.TELEGRAM_MTPROTO_API_ID ||
      '',
    10,
  );
  const apiHash =
    process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH ||
    process.env.TELEGRAM_MTPROTO_API_HASH ||
    '';
  const session =
    process.env.INGESTION_TELEGRAM_MTPROTO_SESSION ||
    process.env.TELEGRAM_MTPROTO_SESSION ||
    '';

  if (!apiId || !apiHash || !session) {
    console.error(
      'Missing Telegram credentials in .env ' +
        '(INGESTION_TELEGRAM_MTPROTO_API_ID/_API_HASH/_SESSION)',
    );
    process.exit(1);
  }

  const client = new TelegramClient(
    new StringSession(session),
    apiId,
    apiHash,
    {
      connectionRetries: 5,
    },
  );

  try {
    console.log('Connecting to Telegram...');
    await client.connect();
    console.log('Connected!\n');

    const channelId = Number(
      readArg('channelId') ?? readArg('channel') ?? -1004466661332,
    );
    const messageId = Number(readArg('messageId') ?? readArg('message') ?? 167);

    if (!Number.isFinite(channelId) || !Number.isFinite(messageId)) {
      console.error(
        'Usage: check-telegram-message --channelId=<id> --messageId=<id>',
      );
      process.exit(1);
    }

    console.log(`Fetching message ${messageId} from channel ${channelId}...\n`);

    // Get the channel entity
    const entity = await client.getEntity(channelId);
    console.log('Channel entity:', JSON.stringify(entity, null, 2));
    console.log('\n---\n');

    // Get the specific message
    const messages = await client.getMessages(entity, {
      ids: [messageId],
    });

    if (messages.length === 0) {
      console.log('Message not found!');
      process.exit(1);
    }

    const message = messages[0];
    console.log('=== RAW MESSAGE FROM TELEGRAM API ===');
    console.log(JSON.stringify(message, null, 2));
    console.log('\n---\n');

    console.log('=== KEY FIELDS ===');
    console.log('message.id:', message.id);
    console.log('message.message (text):', message.message);
    console.log('message.text:', message.text);
    console.log('message.media:', message.media ? 'Present' : 'None');
    if (message.media) {
      console.log('message.media type:', message.media.className);
      console.log('message.media:', JSON.stringify(message.media, null, 2));
    }
    console.log('message.date:', message.date);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.disconnect();
  }
}

checkMessage();

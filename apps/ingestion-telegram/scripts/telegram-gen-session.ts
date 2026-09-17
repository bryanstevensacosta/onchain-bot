import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function main(): Promise<void> {
  const apiIdRaw = process.env.INGESTION_TELEGRAM_MTPROTO_API_ID;
  const apiHash = process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH;
  if (!apiIdRaw || !apiHash) {
    console.error(
      'Missing INGESTION_TELEGRAM_MTPROTO_API_ID or INGESTION_TELEGRAM_MTPROTO_API_HASH env vars. ' +
        'Get them from https://my.telegram.org/apps',
    );
    process.exit(1);
  }
  const apiId = parseInt(apiIdRaw, 10);
  const existing = process.env.INGESTION_TELEGRAM_MTPROTO_SESSION ?? '';

  const session = new StringSession(existing);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  const rl = readline.createInterface({ input, output });

  try {
    await client.start({
      phoneNumber: async () => rl.question('Phone number (e.g. +34612345678): '),
      password: async () =>
        rl.question('2FA password (press Enter if not enabled): '),
      phoneCode: async () =>
        rl.question('Login code from Telegram app/SMS: '),
      onError: (err) => console.error('Telegram auth error:', err),
    });

    const saved: string = await (client.session.save() as unknown as Promise<string>);

    console.log('\n=========================================================');
    console.log('  INGESTION_TELEGRAM_MTPROTO_SESSION (copy this into your .env):');
    console.log('=========================================================');
    console.log(saved);
    console.log('=========================================================\n');
    console.log('Next steps:');
    console.log('  1. Paste the line above into apps/ingestion-service/.env as INGESTION_TELEGRAM_MTPROTO_SESSION');
    console.log('  2. Restart the app: npm run start:dev');
    console.log(
      '  3. Look for "MTProto client connected" in logs\n',
    );
  } finally {
    rl.close();
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

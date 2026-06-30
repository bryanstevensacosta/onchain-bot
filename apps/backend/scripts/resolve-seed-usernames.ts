/**
 * One-time utility script to resolve KOL numeric IDs to @usernames and titles.
 *
 * USAGE:
 *   cd apps/backend
 *   source .env  # Load TELEGRAM_MTPROTO_* vars
 *   npx ts-node --transpile-only scripts/resolve-seed-usernames.ts
 *
 * OUTPUT:
 *   - Progress log for each ID
 *   - TypeScript code block ready to paste into kol.seed.ts
 *   - List of failed IDs (needs manual join)
 *
 * NOTE: This is a read-only operation. No DB writes, no Telegram joins.
 */
import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Logger as GramjsLogger, LogLevel } from 'telegram/extensions/Logger';
import { KOL_SEED } from '../src/kol/identity/infrastructure/seeds/kol.seed';

interface ResolvedKol {
  kolId: string;
  handle: string | null;
  title: string;
}

interface FailedKol {
  kolId: string;
  reason: string;
}

async function main(): Promise<void> {
  const apiIdRaw = process.env.TELEGRAM_MTPROTO_API_ID;
  const apiHash = process.env.TELEGRAM_MTPROTO_API_HASH;
  const sessionString = process.env.TELEGRAM_MTPROTO_SESSION;

  if (!apiIdRaw || !apiHash) {
    console.error(
      'Missing TELEGRAM_MTPROTO_API_ID or TELEGRAM_MTPROTO_API_HASH env vars. ' +
        'Get them from https://my.telegram.org/apps',
    );
    process.exit(1);
  }

  const apiId = parseInt(apiIdRaw, 10);

  // Handle empty session - user needs to run telegram-gen-session first
  const session = new StringSession(sessionString ?? '');
  const silentLogger = new GramjsLogger();
  silentLogger.setLevel(LogLevel.NONE);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    baseLogger: silentLogger,
  });

  console.log('Connecting to Telegram MTProto...');
  await client.connect();
  const authorized = await client.isUserAuthorized();
  if (!authorized) {
    console.error('MTProto session not authorized. Run telegram-gen-session first.');
    await client.disconnect();
    process.exit(1);
  }
  console.log('Connected and authorized.\n');

  const resolved: ResolvedKol[] = [];
  const failed: FailedKol[] = [];

  const total = KOL_SEED.length;
  for (let i = 0; i < total; i++) {
    const seed = KOL_SEED[i];
    const kolId = seed.kolId;
    const idx = i + 1;

    process.stdout.write(`[${idx}/${total}] ${kolId} → `);

    try {
      // Try multiple ID formats
      let entity: unknown = null;
      const formats = [
        kolId.startsWith('-100') ? kolId : `-100${kolId.replace(/^-/, '')}`,
        kolId,
        kolId.startsWith('-') ? kolId : `-${kolId}`,
      ];

      for (const fmt of formats) {
        try {
          entity = await client.getEntity(fmt);
          break;
        } catch {
          // Try next format
        }
      }

      if (!entity) {
        // Try as username directly if it looks like one
        if (/^@/.test(kolId)) {
          entity = await client.getEntity(kolId);
        }
      }

      if (!entity) {
        failed.push({ kolId, reason: 'Could not resolve entity' });
        console.log('FAILED');
        continue;
      }

      // Extract username and title from entity
      const e = entity as {
        id?: { toString(): string } | number | string;
        title?: string;
        username?: string;
        firstName?: string;
        lastName?: string;
      };

      const username = e.username?.trim() || null;
      const title = e.title?.trim() || e.firstName?.trim() || e.lastName?.trim() || `Telegram channel ${e.id}`;

      if (username) {
        resolved.push({ kolId, handle: `@${username}`, title });
        console.log(`@${username} (${title})`);
      } else {
        failed.push({ kolId, reason: `No username - resolved as: ${title}` });
        console.log('NO USERNAME');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ kolId, reason: msg });
      console.log(`FAILED: ${msg}`);
    }
  }

  await client.disconnect();

  // Output TypeScript code block
  console.log('\n=========================================================');
  console.log('  RESOLVED KOLs (paste into kol.seed.ts):');
  console.log('=========================================================\n');

  if (resolved.length > 0) {
    console.log('// === RESOLVED (add username field) ===');
    console.log('export const KOL_SEED_WITH_USERNAMES: ReadonlyArray<SeedKol> = [');
    for (const r of resolved) {
      console.log(`  { kolId: '${r.kolId}', username: '${r.handle}', title: '${r.title.replace(/'/g, "\\'")}' },`);
    }
    console.log('];\n');
  }

  if (failed.length > 0) {
    console.log('// === FAILED TO RESOLVE ===');
    console.log('// These IDs could not be resolved (not members, private, or invalid):');
    for (const f of failed) {
      console.log(`//   ${f.kolId}: ${f.reason}`);
    }
    console.log();
  }

  console.log(`Summary: resolved=${resolved.length} failed=${failed.length} total=${total}`);
  console.log('\n=========================================================');
  console.log('  USAGE:');
  console.log('=========================================================');
  console.log('1. Copy the resolved KOLs above into kol.seed.ts');
  console.log('2. Add "username?: string" to SeedKol interface');
  console.log('3. Update KolSeeder to use seedUsername for joinChannel\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
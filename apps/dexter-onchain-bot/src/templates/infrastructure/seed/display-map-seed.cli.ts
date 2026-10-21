import { readFileSync } from 'node:fs';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import {
  isDatabaseEnabled,
  redactDatabaseUrl,
} from '@/shared/database/database.module';
import { DisplayMapRepository } from '@/templates/domain/ports/display-map.repository';
import seedRows from './data/display-maps.seed.json';
import {
  parseDisplayMapSeed,
  prepareSeedCliEnv,
  seedDisplayMaps,
} from './display-map-seed.service';

/**
 * Manual DisplayMap seed CLI (plan todo 9).
 *
 * `npm run seed:display-maps -- [--apply] [--file=<path>] [--allow-prod]`
 *
 * Dry-run by DEFAULT: a write needs the explicit `--apply` flag and the
 * resolved (redacted) database target is printed before any read/write.
 * The shipped catalog is `./data/display-maps.seed.json` (imported so
 * `nest build` emits it into `dist/`); `--file` accepts an external JSON.
 *
 * This entrypoint is NOT registered in any Nest module and the app
 * runtime never imports the seed file. `prepareSeedCliEnv()` must run
 * before the application context exists (bootstrap hooks: template seed
 * + update poller).
 *
 * In the container (WORKDIR `/app`, image includes dist but no sources):
 * `node apps/dexter-onchain-bot/dist/templates/infrastructure/seed/display-map-seed.cli.js --apply`
 */
export interface SeedCliOptions {
  readonly apply: boolean;
  readonly file: string | null;
  readonly allowProd: boolean;
}

export function parseSeedCliArgs(argv: readonly string[]): SeedCliOptions {
  let apply = false;
  let sawDryRun = false;
  let file: string | null = null;
  let allowProd = false;

  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      sawDryRun = true;
      continue;
    }
    if (arg === '--allow-prod') {
      allowProd = true;
      continue;
    }
    if (arg.startsWith('--file=')) {
      const value = arg.slice('--file='.length).trim();
      if (value === '') {
        throw new Error('--file requires a path (--file=<path>)');
      }
      file = value;
      continue;
    }
    throw new Error(
      `Unknown argument ${JSON.stringify(arg)} ` +
        '(valid: --apply, --dry-run, --file=<path>, --allow-prod)',
    );
  }

  if (apply && sawDryRun) {
    throw new Error('--apply and --dry-run are mutually exclusive');
  }

  return { apply, file, allowProd };
}

function readSeedFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `Cannot read seed file ${JSON.stringify(path)}: ` +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

export async function runSeedCli(argv: readonly string[]): Promise<number> {
  prepareSeedCliEnv();

  let options: SeedCliOptions;
  let rows: ReturnType<typeof parseDisplayMapSeed>;
  try {
    options = parseSeedCliArgs(argv);
    if (!isDatabaseEnabled()) {
      throw new Error(
        'DATABASE_ENABLED=false: the repository is in-memory and would not persist',
      );
    }
    if (process.env.NODE_ENV === 'production' && !options.allowProd) {
      throw new Error('NODE_ENV=production is refused without --allow-prod');
    }
    rows = parseDisplayMapSeed(
      options.file === null ? seedRows : readSeedFile(options.file),
    );
  } catch (error) {
    console.error(
      `seed:display-maps aborted: ` +
        (error instanceof Error ? error.message : String(error)),
    );
    return 1;
  }

  const db = process.env.DATABASE_URL
    ? redactDatabaseUrl(process.env.DATABASE_URL)
    : '<DATABASE_URL unset>';
  console.log(
    `seed:display-maps db=${db} cwd=${process.cwd()} ` +
      `mode=${options.apply ? 'apply' : 'dry-run'} rows=${rows.length}`,
  );

  let app: INestApplicationContext | null = null;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    const maps = app.get(DisplayMapRepository);
    const report = await seedDisplayMaps(maps, rows, {
      dryRun: !options.apply,
    });

    for (const item of report.drift) {
      console.warn(
        `drift (not overwritten): (${item.placeholderKey}, ${item.matchValue}) ` +
          `seed=${JSON.stringify(item.seedDisplay)} ` +
          `existing=${JSON.stringify(item.existingDisplay)}`,
      );
    }
    console.log(
      `seed:display-maps created=${report.created} skipped=${report.skipped} ` +
        `wouldCreate=${report.wouldCreate} drift=${report.drift.length}`,
    );
    return 0;
  } catch (error) {
    console.error(
      `seed:display-maps failed: ` +
        (error instanceof Error ? error.message : String(error)),
    );
    return 1;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

if (require.main === module) {
  void runSeedCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

import { DisplayMap } from '@/templates/domain/display-map.entity';
import {
  DisplayMapDuplicateError,
  DisplayMapValidationError,
} from '@/templates/domain/display-map.validators';
import type { DisplayMapRepository } from '@/templates/domain/ports/display-map.repository';

/**
 * Manual DisplayMap seed (plan todo 9, "a pedido — NADA automatico").
 *
 * Two layers, both pure (no Nest, no I/O):
 * - `parseDisplayMapSeed` validates + normalizes a JSON array BEFORE any
 *   write: non-empty array, exactly `placeholderKey`/`matchValue`/`display`
 *   per row (the entity ignores unknown props, so the shape is enforced
 *   here), `DisplayMap.create` for whitelist/length normalization, and
 *   duplicate detection on the NORMALIZED pair (`Pump-Fun` and `pump-fun`
 *   collide). A bad file writes NOTHING.
 * - `seedDisplayMaps` applies the rows through the existing repository
 *   port: create-if-missing, skip-if-present, report `drift` when the
 *   operator's existing display differs (NEVER overwrite — a seed must not
 *   stomp live edits). A duplicate racing in from the UI or another CLI is
 *   counted as `skipped`, so a run never aborts half-way.
 *
 * The CLI is the ONLY consumer (it imports the shipped JSON); the app
 * runtime never reads this file and nothing auto-loads it at bootstrap.
 */
export interface DisplayMapSeedRow {
  readonly placeholderKey: string;
  readonly matchValue: string;
  readonly display: string;
}

export interface DisplayMapSeedDrift {
  readonly placeholderKey: string;
  readonly matchValue: string;
  readonly seedDisplay: string;
  readonly existingDisplay: string;
}

export interface DisplayMapSeedReport {
  readonly created: number;
  readonly skipped: number;
  readonly wouldCreate: number;
  readonly drift: readonly DisplayMapSeedDrift[];
}

/** Exactly the three keys a seed row may carry (sorted). */
const SEED_ROW_KEYS = ['display', 'matchValue', 'placeholderKey'] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pairKey = (placeholderKey: string, matchValue: string): string =>
  `${placeholderKey}\u0000${matchValue}`;

/**
 * Strict parser: validates every row with the domain entity (same
 * whitelist/length rules as the API) and rejects duplicate pairs on the
 * normalized values before returning. Throws `DisplayMapValidationError`;
 * callers map it to exit code 1.
 */
export function parseDisplayMapSeed(
  raw: unknown,
): readonly DisplayMapSeedRow[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new DisplayMapValidationError(
      'DisplayMap seed must be a non-empty array of rows',
    );
  }

  const entries: unknown[] = raw;
  const seen = new Set<string>();
  const rows: DisplayMapSeedRow[] = [];

  for (const [index, entry] of entries.entries()) {
    if (!isPlainObject(entry)) {
      throw new DisplayMapValidationError(
        `DisplayMap seed row ${index} must be an object`,
      );
    }
    const keys = Object.keys(entry).sort();
    if (
      keys.length !== SEED_ROW_KEYS.length ||
      SEED_ROW_KEYS.some((key, position) => keys[position] !== key)
    ) {
      throw new DisplayMapValidationError(
        `DisplayMap seed row ${index} must have exactly ` +
          `${SEED_ROW_KEYS.join(', ')} (got ${keys.join(', ') || 'no keys'})`,
      );
    }

    // Domain normalization (trim + whitelist + lowercase matchValue +
    // length limits). Unknown props are ignored by `create`, hence the
    // explicit shape check above.
    const entity = DisplayMap.create({
      placeholderKey: entry.placeholderKey,
      matchValue: entry.matchValue,
      display: entry.display,
    });
    const row: DisplayMapSeedRow = {
      placeholderKey: entity.placeholderKey,
      matchValue: entity.matchValue,
      display: entity.display,
    };

    const key = pairKey(row.placeholderKey, row.matchValue);
    if (seen.has(key)) {
      throw new DisplayMapValidationError(
        `DisplayMap seed row ${index} duplicates ` +
          `(${row.placeholderKey}, ${row.matchValue}) after normalization`,
      );
    }
    seen.add(key);
    rows.push(row);
  }

  return rows;
}

/**
 * Create-if-missing seed. `dryRun` counts pending rows without writing.
 *
 * `skipped` includes drift rows (existing pair, whatever the display):
 * they are already in the catalog, so nothing is written. `drift` carries
 * the difference for the operator, never a correction.
 */
export async function seedDisplayMaps(
  maps: DisplayMapRepository,
  rows: readonly DisplayMapSeedRow[],
  options: { readonly dryRun: boolean },
): Promise<DisplayMapSeedReport> {
  const existing = await maps.findAll();
  const index = new Map<string, DisplayMap>();
  for (const map of existing) {
    index.set(pairKey(map.placeholderKey, map.matchValue), map);
  }

  let created = 0;
  let skipped = 0;
  let wouldCreate = 0;
  const drift: DisplayMapSeedDrift[] = [];

  for (const row of rows) {
    const current = index.get(pairKey(row.placeholderKey, row.matchValue));
    if (current) {
      skipped += 1;
      if (current.display !== row.display) {
        drift.push({
          placeholderKey: row.placeholderKey,
          matchValue: row.matchValue,
          seedDisplay: row.display,
          existingDisplay: current.display,
        });
      }
      continue;
    }

    if (options.dryRun) {
      wouldCreate += 1;
      continue;
    }

    try {
      await maps.save(DisplayMap.create(row));
      created += 1;
    } catch (error) {
      // Concurrent insert (UI/another CLI) between findAll() and save():
      // the pair is already there, which is the seed's goal. Keep going.
      if (error instanceof DisplayMapDuplicateError) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { created, skipped, wouldCreate, drift };
}

/**
 * Neutralizes the AppModule bootstrap side effects a seed run must not
 * trigger. MUST run before `NestFactory.createApplicationContext(AppModule)`:
 * - `DEXTER_SEED_TEMPLATES='false'`: the template seed hook defaults to
 *   TRUE when the env var is absent, so the CLI would otherwise create
 *   message templates as a side effect.
 * - `DEXTER_INGEST_MODE='webhook'`: with `polling` + a bot token, the
 *   update poller calls `deleteWebhook` and starts a second `getUpdates`
 *   loop that would dispatch real user commands from the seed process.
 *
 * `DATABASE_ENABLED`/`DATABASE_URL` CANNOT be forced here: the database
 * module evaluates them while `app.module.ts` is imported.
 */
export function prepareSeedCliEnv(env: NodeJS.ProcessEnv = process.env): void {
  env.DEXTER_SEED_TEMPLATES = 'false';
  env.DEXTER_INGEST_MODE = 'webhook';
}

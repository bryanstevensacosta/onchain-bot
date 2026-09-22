/**
 * Backfill backend KOL channels into `telegram_feed_sources` (type='kol').
 *
 * Plan item 6 (telegram-feed-unification): idempotent, count-verified, via the
 * batch API — never direct DB writes.
 *
 * Source of truth: backend `GET /telegram-kol/identity/kols` (KolController.list
 * → ListKolsUseCase → KolView {id, handle, title, isActive, lifecycleStatus,
 * lastIngestedAt}). Read-only against the backend; this script never POSTs,
 * PATCHes or DELETEs there.
 *
 * Sink: ingestion `POST /api/feed/sources/batch` (SourcesController.batchUpsert
 * → RegisterNewsSourceUseCase.executeBatch) — idempotent upsert by channel_id:
 * existing rows UPDATE handle/title/lifecycle in place, never duplicate.
 *
 * Field mapping (KolView → batch item):
 * - id (kol_id PK)        → channelId (feed PK)
 * - handle                → handle (trimmed, '' → null)
 * - title                 → title (required non-empty; abort otherwise)
 * - lifecycleStatus       → lifecycleStatus: ACTIVE → ACTIVE,
 *                           DORMANT | BLACKLISTED → INACTIVE
 *                           (feed only models ACTIVE | INACTIVE)
 * - isActive              → isActive (literal passthrough; the active-set
 *                           query `isActive + lifecycle ACTIVE` then matches
 *                           the backend findActive() semantics on both sides)
 * - type                  → always 'kol'
 * - lastIngestedAt        → NOT carried: the batch API has no such field and
 *                           the feed row starts NULL; the coordinator (item 7)
 *                           becomes the writer of this clock afterwards.
 *
 * Failure contract: if the backend list cannot be fetched (network error or
 * non-2xx), the script aborts BEFORE any batch POST (exit 1, zero writes).
 * All items are validated locally before the first POST, and the server
 * validates each batch before writing, so a 400 leaves the table untouched.
 *
 * Usage:
 *   node -r ts-node/register/transpile-only scripts/backfill-kols-to-feed.ts \
 *     -- --dry-run
 *   node -r ts-node/register/transpile-only scripts/backfill-kols-to-feed.ts \
 *     -- --backend-url http://localhost:3040 --ingestion-url http://localhost:3039
 *
 * Flags:
 *   --dry-run            plan only: print N + lifecycle histogram + first rows,
 *                        touch nothing (no POST; no ingestion reads either)
 *   --backend-url <url>  backend base URL (default http://localhost:3040)
 *   --ingestion-url <url> ingestion base URL (default http://localhost:3039;
 *                        NEVER point at live :3030/:3031/:3032 on this host)
 *   --input-json <path>  offline mode: read KolView[] from a JSON file instead
 *                        of HTTP (used when the dev backend DB holds 0 kols;
 *                        fixture built from kol.seed.ts, read-only transform)
 *   --limit <n>          cap rows processed (smoke runs)
 *   --chunk-size <n>     batch POST size (default 500 = server cap)
 */

export interface BackfillKolView {
  readonly id: string;
  readonly handle: string | null;
  readonly title: string;
  readonly isActive: boolean;
  readonly lifecycleStatus: 'ACTIVE' | 'DORMANT' | 'BLACKLISTED';
  readonly lastIngestedAt: string | null;
}

export interface FeedBatchItem {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
  readonly type: 'kol';
  readonly isActive: boolean;
  readonly lifecycleStatus: 'ACTIVE' | 'INACTIVE';
}

export interface BackfillPlan {
  readonly total: number;
  readonly byLifecycle: Record<string, number>;
  readonly items: ReadonlyArray<FeedBatchItem>;
}

export interface BatchPostResult {
  readonly created: number;
  readonly updated: number;
  readonly total: number;
}

export interface BackfillReport {
  readonly dryRun: boolean;
  readonly source: string;
  readonly fetched: number;
  readonly planned: BackfillPlan;
  readonly batchesSent: number;
  readonly created: number;
  readonly updated: number;
  readonly feedKolCountAfter: number | null;
  readonly countMatch: boolean | null;
}

export const BATCH_SERVER_CAP = 500;

export class BackendUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackendUnreachableError';
  }
}

export class BackfillValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackfillValidationError';
  }
}

type FetchImpl = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/**
 * Map one backend KolView to a feed batch item (type='kol').
 * Throws BackfillValidationError on empty id/title — fail fast before writes.
 */
export function mapKolToBatchItem(kol: BackfillKolView): FeedBatchItem {
  const channelId = kol.id?.trim() ?? '';
  if (channelId.length === 0) {
    throw new BackfillValidationError('KolView.id (kol_id) cannot be empty');
  }
  const numeric = channelId.replace(/^-100/, '').replace(/^[+-]/, '');
  if (!/^\d+$/.test(numeric)) {
    throw new BackfillValidationError(
      `KolView.id has an invalid format: ${kol.id}. Must be numeric`,
    );
  }
  const title = kol.title?.trim() ?? '';
  if (title.length === 0) {
    throw new BackfillValidationError(
      `KolView.title cannot be empty (kol_id=${channelId})`,
    );
  }
  const rawHandle = kol.handle?.trim() ?? '';
  return {
    channelId,
    handle: rawHandle.length > 0 ? rawHandle : null,
    title,
    type: 'kol',
    isActive: kol.isActive === true,
    lifecycleStatus: kol.lifecycleStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
  };
}

/** Pure planner: map + histogram, zero IO (this is what --dry-run prints). */
export function planBackfill(kols: ReadonlyArray<BackfillKolView>): BackfillPlan {
  const items = kols.map(mapKolToBatchItem);
  const byLifecycle: Record<string, number> = {};
  for (const item of items) {
    byLifecycle[item.lifecycleStatus] =
      (byLifecycle[item.lifecycleStatus] ?? 0) + 1;
  }
  return { total: items.length, byLifecycle, items };
}

export function chunkItems<T>(
  items: ReadonlyArray<T>,
  size: number,
): Array<ReadonlyArray<T>> {
  if (!Number.isInteger(size) || size <= 0) {
    throw new BackfillValidationError(
      `chunk size must be a positive integer (got ${size})`,
    );
  }
  const chunks: Array<ReadonlyArray<T>> = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function defaultFetch(): FetchImpl {
  const g = globalThis as unknown as { fetch?: FetchImpl };
  if (!g.fetch) {
    throw new Error('global fetch is unavailable (Node 22+ required)');
  }
  return g.fetch.bind(globalThis);
}

/** Fetch the full backend KOL list. Throws BackendUnreachableError — no writes. */
export async function fetchBackendKols(
  backendUrl: string,
  fetchImpl: FetchImpl = defaultFetch(),
): Promise<BackfillKolView[]> {
  const url = `${backendUrl.replace(/\/$/, '')}/telegram-kol/identity/kols`;
  let res: Awaited<ReturnType<FetchImpl>>;
  try {
    res = await fetchImpl(url, {
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    throw new BackendUnreachableError(
      `backend unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}. ` +
        `Aborting BEFORE any write — no batch was posted.`,
    );
  }
  if (!res.ok) {
    throw new BackendUnreachableError(
      `backend list failed: HTTP ${res.status} ${res.statusText} at ${url}. ` +
        `Aborting BEFORE any write — no batch was posted.`,
    );
  }
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new BackendUnreachableError(
      `backend list returned a non-array payload at ${url}. Aborting BEFORE any write.`,
    );
  }
  return body as BackfillKolView[];
}

async function postBatch(
  ingestionUrl: string,
  chunk: ReadonlyArray<FeedBatchItem>,
  fetchImpl: FetchImpl,
): Promise<BatchPostResult> {
  const url = `${ingestionUrl.replace(/\/$/, '')}/api/feed/sources/batch`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sources: chunk }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new BackfillValidationError(
      `batch POST failed: HTTP ${res.status} ${res.statusText} at ${url} — ${detail.slice(0, 300)}`,
    );
  }
  const body = (await res.json()) as {
    created: number;
    updated: number;
    total: number;
  };
  return { created: body.created, updated: body.updated, total: body.total };
}

async function getFeedKolCount(
  ingestionUrl: string,
  fetchImpl: FetchImpl,
): Promise<number> {
  const url = `${ingestionUrl.replace(/\/$/, '')}/api/feed/sources?type=kol`;
  const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new BackfillValidationError(
      `feed count read failed: HTTP ${res.status} at ${url}`,
    );
  }
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new BackfillValidationError(
      `feed sources payload is not an array at ${url}`,
    );
  }
  return body.length;
}

export interface RunBackfillOptions {
  readonly backendUrl: string;
  readonly ingestionUrl: string;
  readonly inputJson?: string | undefined;
  readonly limit?: number | undefined;
  readonly chunkSize?: number | undefined;
  readonly dryRun: boolean;
  readonly readFile?: (path: string) => Promise<string>;
}

export async function runBackfill(
  options: RunBackfillOptions,
  deps: { fetchImpl?: FetchImpl } = {},
): Promise<BackfillReport> {
  const fetchImpl = deps.fetchImpl ?? defaultFetch();
  const chunkSize = options.chunkSize ?? BATCH_SERVER_CAP;
  if (chunkSize > BATCH_SERVER_CAP) {
    throw new BackfillValidationError(
      `chunk-size ${chunkSize} exceeds the server batch cap of ${BATCH_SERVER_CAP}`,
    );
  }

  // (1) Load source rows — HTTP preferred; abort here on failure, zero writes.
  let kols: BackfillKolView[];
  let source: string;
  if (options.inputJson) {
    const readFile =
      options.readFile ??
      ((p: string) =>
        import('node:fs/promises').then((fs) => fs.readFile(p, 'utf8')));
    const raw = await readFile(options.inputJson);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new BackfillValidationError(
        `--input-json ${options.inputJson} must contain a JSON array of KolView`,
      );
    }
    kols = parsed as BackfillKolView[];
    source = `file:${options.inputJson}`;
  } else {
    kols = await fetchBackendKols(options.backendUrl, fetchImpl);
    source = `GET ${options.backendUrl.replace(/\/$/, '')}/telegram-kol/identity/kols`;
  }

  const limited =
    options.limit !== undefined ? kols.slice(0, options.limit) : kols;

  // (2) Validate + map EVERYTHING before the first write.
  const planned = planBackfill(limited);

  if (options.dryRun || planned.total === 0) {
    return {
      dryRun: true,
      source,
      fetched: kols.length,
      planned,
      batchesSent: 0,
      created: 0,
      updated: 0,
      feedKolCountAfter: null,
      countMatch: null,
    };
  }

  // (3) Real run: chunked idempotent upserts.
  const chunks = chunkItems(planned.items, chunkSize);
  let created = 0;
  let updated = 0;
  chunks.forEach((chunk, index) => {
    if (chunk.length === 0) {
      throw new BackfillValidationError(`empty chunk at index ${index}`);
    }
  });
  for (const chunk of chunks) {
    const out = await postBatch(options.ingestionUrl, chunk, fetchImpl);
    created += out.created;
    updated += out.updated;
  }

  // (4) Parity: feed type=kol count must equal the source row count when the
  // source is the live backend (fixture mode only reports).
  const feedKolCountAfter = await getFeedKolCount(
    options.ingestionUrl,
    fetchImpl,
  );
  const fromBackend = options.inputJson === undefined;
  const countMatch = fromBackend
    ? feedKolCountAfter === planned.total
    : null;

  return {
    dryRun: false,
    source,
    fetched: kols.length,
    planned,
    batchesSent: chunks.length,
    created,
    updated,
    feedKolCountAfter,
    countMatch,
  };
}

function printReport(report: BackfillReport): void {
  // eslint-disable-next-line no-console
  console.log(`source : ${report.source}`);
  // eslint-disable-next-line no-console
  console.log(`fetched: ${report.fetched} kol rows`);
  // eslint-disable-next-line no-console
  console.log(
    `planned: ${report.planned.total} feed items (type=kol) ` +
      JSON.stringify(report.planned.byLifecycle),
  );
  const preview = report.planned.items.slice(0, 5);
  for (const item of preview) {
    // eslint-disable-next-line no-console
    console.log(
      `  - ${item.channelId} handle=${item.handle ?? 'null'} ` +
        `title=${JSON.stringify(item.title)} ` +
        `lifecycle=${item.lifecycleStatus} active=${item.isActive}`,
    );
  }
  if (report.planned.total > preview.length) {
    // eslint-disable-next-line no-console
    console.log(`  ... and ${report.planned.total - preview.length} more`);
  }
  if (report.dryRun) {
    // eslint-disable-next-line no-console
    console.log('DRY-RUN: no writes performed (no batch POST issued).');
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    `batches: ${report.batchesSent} sent → created=${report.created} updated=${report.updated}`,
  );
  // eslint-disable-next-line no-console
  console.log(`feed type=kol count after: ${report.feedKolCountAfter}`);
  if (report.countMatch === true) {
    // eslint-disable-next-line no-console
    console.log('PARITY OK: backend kols count == feed type=kol count.');
  } else if (report.countMatch === false) {
    // eslint-disable-next-line no-console
    console.log(
      'PARITY MISMATCH: backend kols count != feed type=kol count — investigate before item 8.',
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      'PARITY N/A (fixture mode): compare feed count against the fixture size manually.',
    );
  }
}

function parseArgs(argv: ReadonlyArray<string>): RunBackfillOptions {
  let backendUrl = 'http://localhost:3040';
  let ingestionUrl = 'http://localhost:3039';
  let inputJson: string | undefined;
  let limit: number | undefined;
  let chunkSize: number | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--backend-url' && next !== undefined) {
      backendUrl = next;
      i += 1;
    } else if (arg === '--ingestion-url' && next !== undefined) {
      ingestionUrl = next;
      i += 1;
    } else if (arg === '--input-json' && next !== undefined) {
      inputJson = next;
      i += 1;
    } else if (arg === '--limit' && next !== undefined) {
      limit = parseInt(next, 10);
      i += 1;
    } else if (arg === '--chunk-size' && next !== undefined) {
      chunkSize = parseInt(next, 10);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      // eslint-disable-next-line no-console
      console.log(
        'Usage: backfill-kols-to-feed.ts [--dry-run] [--backend-url URL] ' +
          '[--ingestion-url URL] [--input-json PATH] [--limit N] [--chunk-size N]',
      );
      process.exit(0);
    }
  }
  for (const url of [backendUrl, ingestionUrl]) {
    for (const live of [':3030', ':3031', ':3032']) {
      if (url.includes(live)) {
        throw new BackfillValidationError(
          `refusing live port in ${url} (${live} is a production service on this host) — use dev ports only`,
        );
      }
    }
  }
  return {
    backendUrl,
    ingestionUrl,
    inputJson,
    limit,
    chunkSize,
    dryRun,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await runBackfill(options);
  printReport(report);
  if (report.countMatch === false) {
    process.exit(1);
  }
}

// Only auto-run as a CLI entrypoint — importing this module (specs) must not
// trigger network IO. ts-node entry scripts share argv with jest workers, so
// require an explicit backfill flag footprint: any recognized CLI flag.
const CLI_FLAGS = new Set([
  '--dry-run',
  '--backend-url',
  '--ingestion-url',
  '--input-json',
  '--limit',
  '--chunk-size',
  '--help',
  '-h',
]);
const invokedAsCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.slice(2).some((a) => CLI_FLAGS.has(a));

if (invokedAsCli) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(
      `backfill FAILED: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`,
    );
    process.exit(1);
  });
}

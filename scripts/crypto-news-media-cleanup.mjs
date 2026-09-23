#!/usr/bin/env node
/**
 * Inventory + verification for backend `uploads/crypto-news/media/`.
 *
 * Context: backend publish-time cache of ingestion-telegram media
 * (see .omo/drafts/backend-media-ownership.md). Ingestion-telegram owns the
 * originals + 72h janitor (`CryptoNewsRetentionCleanupScheduler`, lock
 * 9_421_373); anything it already janitored (404) must NOT be deleted by
 * this plan (irreversible orphan pinning). `uploads/crypto-news-ads-library/`
 * is backend-owned and ALWAYS out of scope — this script never walks it.
 *
 * What it does:
 *   (a) inventory: file count (`find <UPLOADS>/crypto-news/media -type f`),
 *       total bytes (`du -sh` equivalent), mtime min/max stat summary.
 *   (b) per-file: parse `<channel>/<msg>_<idx>.<ext>` with the SAME regex
 *       as the publisher (`crypto-news\/media\/([^/]+)\/(\d+)_(\d+)`) and
 *       verify against ingestion-telegram
 *       `HEAD {INGESTION_URL}/api/media/{ch}/{msg}/{idx}`
 *       (endpoint shape: `GET /api/media/:channelId/:messageId/:index`,
 *       see apps/ingestion-telegram/src/media/api/http/media.controller.ts:88).
 *       200 -> `borrable-verificado`; any other status -> `no-borrable+razon`
 *       (likely post-72h orphan); network/timeout -> `error-verificacion`.
 *
 * Modes: DEFAULT IS ALWAYS dry-run (prints totals, deletes nothing), even
 * with no flags. Real deletion ONLY with BOTH `--delete-verified --yes`
 * (second confirmation) and then ONLY files classified `borrable-verificado`.
 *
 * Usage: node scripts/crypto-news-media-cleanup.mjs [--root <path>] [--dry-run]
 *        node scripts/crypto-news-media-cleanup.mjs --root ./apps/backend/uploads --dry-run
 *        node scripts/crypto-news-media-cleanup.mjs --delete-verified --yes --root <path>
 *
 * Env: UPLOADS_ROOT (overridden by --root), INGESTION_TELEGRAM_URL
 *      (overridden by --ingestion-url, default http://localhost:3031).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Dual-match regex (transition): classifies BOTH the legacy
// `crypto-news/media/...` layout and the new `feed/media/...` layout so
// old + new files both verify during the move window. Same shape as the
// publisher path reconstruction — do not diverge.
const MEDIA_PATH_RE = /(?:crypto-news|feed)\/media\/([^/]+)\/(\d+)_(\d+)/;

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}
function hasFlag(...names) {
  return names.some((n) => args.includes(n));
}

if (hasFlag('--help', '-h')) {
  console.log(`[cleanup] usage:
  node scripts/crypto-news-media-cleanup.mjs [--root <uploads>] [--dry-run]
  node scripts/crypto-news-media-cleanup.mjs --delete-verified --yes [--root <uploads>]
  [--ingestion-url <url>] [--timeout-ms <n>]
  Defaults: --dry-run (no flags needed), --root=$UPLOADS_ROOT|./apps/backend/uploads,
  --ingestion-url=$INGESTION_TELEGRAM_URL|http://localhost:3031`);
  process.exit(0);
}

const UPLOADS_ROOT =
  argValue('--root') || process.env.UPLOADS_ROOT || './apps/backend/uploads';
const INGESTION_URL =
  argValue('--ingestion-url') ||
  process.env.INGESTION_TELEGRAM_URL ||
  'http://localhost:3031';
const TIMEOUT_MS = parseInt(argValue('--timeout-ms') || '8000', 10) || 8000;
const DELETE_MODE = hasFlag('--delete-verified');
const CONFIRMED = hasFlag('--yes', '-y');
// --dry-run is the default mode even with no flags; passing it is a no-op.
const DRY_RUN = !DELETE_MODE || !CONFIRMED;

const MEDIA_ROOT = path.join(UPLOADS_ROOT, 'crypto-news', 'media');

function humanBytes(n) {
  if (n < 1024) return `${n}B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(1)}${units[u]}`;
}

async function walkFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out;
    throw err;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(full)));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function parseMediaPath(filePath) {
  const m = filePath.replace(/\\/g, '/').match(MEDIA_PATH_RE);
  if (!m) return null;
  return { channel: m[1], msg: m[2], idx: m[3] };
}

async function headMedia(channel, msg, idx) {
  const url = `${INGESTION_URL.replace(/\/$/, '')}/api/media/${encodeURIComponent(channel)}/${msg}/${idx}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // HEAD first (cheap); fall back to GET if the server rejects HEAD.
    let res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', signal: ctrl.signal });
      try {
        await res.arrayBuffer();
      } catch {
        /* ignore body drain errors */
      }
    }
    return { status: res.status };
  } catch (err) {
    return { error: err.name === 'AbortError' ? `timeout>${TIMEOUT_MS}ms` : String(err.message || err) };
  } finally {
    clearTimeout(t);
  }
}

async function pingMessagesEndpoint() {
  const url = `${INGESTION_URL.replace(/\/$/, '')}/api/feed/messages?limit=50`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return `HTTP ${res.status}`;
  } catch (err) {
    return err.name === 'AbortError' ? `timeout>${TIMEOUT_MS}ms` : `unreachable (${err.message || err})`;
  } finally {
    clearTimeout(t);
  }
}

// --- (a) inventory ---
const files = await walkFiles(MEDIA_ROOT);
let totalBytes = 0;
let oldest = null;
let newest = null;
const mtimes = [];
for (const f of files) {
  try {
    const st = await fs.stat(f);
    totalBytes += st.size;
    mtimes.push({ file: f, mtime: st.mtime, size: st.size });
    if (!oldest || st.mtime < oldest) oldest = st.mtime;
    if (!newest || st.mtime > newest) newest = st.mtime;
  } catch {
    /* raced deletion — counted in find, skipped in du */
  }
}
console.log(`[cleanup] root: ${MEDIA_ROOT}`);
console.log(`[cleanup] find: ${files.length} file(s)`);
console.log(`[cleanup] du: ${humanBytes(totalBytes)} (${totalBytes} bytes)`);
if (mtimes.length > 0) {
  console.log(`[cleanup] mtime oldest: ${oldest.toISOString()}`);
  console.log(`[cleanup] mtime newest: ${newest.toISOString()}`);
} else {
  console.log(`[cleanup] mtime: n/a (empty or missing dir)`);
}

if (files.length === 0) {
  console.log(`[cleanup] total=0 verificable=0 huerfano-post-72h=0`);
  process.exit(0);
}

// --- (b) per-file verification ---
const reachability = await pingMessagesEndpoint();
console.log(`[cleanup] ingestion messages endpoint: ${reachability}`);

let borrable = 0;
let noBorrable = 0;
let errores = 0;
const deletablePaths = [];
for (const f of files) {
  const parsed = parseMediaPath(f);
  if (!parsed) {
    noBorrable += 1;
    console.log(`[cleanup] NO-borrable (unparseable path, fuera de patron <channel>/<msg>_<idx>.<ext>): ${f}`);
    continue;
  }
  const { channel, msg, idx } = parsed;
  const r = await headMedia(channel, msg, idx);
  if (r.status === 200) {
    borrable += 1;
    deletablePaths.push(f);
    console.log(`[cleanup] borrable-verificado (ingestion 200): ${f}`);
  } else if (r.status !== undefined) {
    noBorrable += 1;
    const reason =
      r.status === 404
        ? 'ingestion 404 — posible huerfano post-72h (janitoreado, NO borrar por este plan)'
        : `ingestion HTTP ${r.status}`;
    console.log(`[cleanup] NO-borrable (${reason}): ${f}`);
  } else {
    errores += 1;
    console.log(`[cleanup] error-verificacion (${r.error}): ${f}`);
  }
}

// Required summary line with the 3 figures.
console.log(
  `[cleanup] total=${files.length} verificable=${borrable} huerfano-post-72h=${noBorrable} errores-verificacion=${errores}`,
);

// --- mode gate: NEVER default to delete ---
if (!DELETE_MODE) {
  console.log(`[cleanup] dry-run: nada borrado (modo por defecto)`);
  process.exit(0);
}
if (!CONFIRMED) {
  console.log(
    `[cleanup] dry-run: --delete-verified exige segunda confirmacion (--yes). Nada borrado.`,
  );
  process.exit(0);
}
// Real deletion: ONLY verified-deletable files, explicit double flag.
let deleted = 0;
for (const f of deletablePaths) {
  try {
    await fs.unlink(f);
    deleted += 1;
    console.log(`[cleanup] deleted: ${f}`);
  } catch (err) {
    console.log(`[cleanup] delete-failed (${err.code || err.message}): ${f}`);
  }
}
console.log(`[cleanup] delete done: ${deleted}/${deletablePaths.length} borrable-verificado`);
process.exit(0);

import { readEnv } from './lib/env.mjs';

const API_BASE = process.env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';
const POLL_MS = 3000;
const POLL_MAX = 10;
const FETCH_TIMEOUT_MS = 10000;

function printHelp() {
  console.log(`Usage: node threads-meta-test/publish.mjs --text "..." [--dry-run|--mock|--mock=never-finishes]`);
  console.log(``);
  console.log(`2-step TEXT flow (https://developers.facebook.com/docs/threads/posts/):`);
  console.log(`  1. POST /{uid}/threads { media_type: TEXT, text } -> container id`);
  console.log(`  2. Poll container status every 3s x10 until FINISHED (~30s)`);
  console.log(`  3. POST /{uid}/threads_publish { creation_id } -> published`);
  console.log(`Limits: text <= 500 chars, 250 posts/24h`);
  console.log(``);
  console.log(`Example:`);
  console.log(`  THREADS_ACCESS_TOKEN=FAKE node threads-meta-test/publish.mjs --text "spike" --dry-run`);
}

function parseArgs(argv) {
  const out = { text: null, dryRun: false, mock: false, mockMode: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--mock') { out.mock = true; out.mockMode = 'ok'; }
    else if (a.startsWith('--mock=')) { out.mock = true; out.mockMode = a.slice('--mock='.length); }
    else if (a === '--text') { out.text = argv[i + 1] ?? null; i++; }
    else if (a.startsWith('--text=')) out.text = a.slice('--text='.length);
  }
  if (out.mockMode === null && out.mock) out.mockMode = 'ok';
  return out;
}

function loadDotEnv() {
  try {
    const e = readEnv('threads-meta-test/.env');
    if (e && typeof e === 'object') return e;
  } catch {
    // missing -> empty
  }
  return {};
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function maskToken(t) {
  if (!t) return '***';
  return '***';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.text === null || args.text === undefined || args.text === '') {
    console.error('MISSING --text "..." required');
    printHelp();
    process.exit(1);
  }
  const text = args.text;
  if (text.length > 500) {
    console.error(`TEXT_TOO_LONG len=${text.length}`);
    process.exit(1);
  }

  const fileEnv = loadDotEnv();
  const token = process.env.THREADS_ACCESS_TOKEN ?? fileEnv.THREADS_ACCESS_TOKEN;
  const uid = process.env.THREADS_USER_ID ?? fileEnv.THREADS_USER_ID ?? 'me';

  const isMock = args.mock;
  const isDryRun = args.dryRun;

  // --- dry-run: zero fetch ---
  if (isDryRun) {
    console.log(`DRY-RUN token=${maskToken(token)} uid=${uid}`);
    console.log(`DRY-RUN POST ${API_BASE}/${uid}/threads payload=${JSON.stringify({ media_type: 'TEXT', text })}`);
    console.log(`DRY-RUN poll status 3s x10 until FINISHED`);
    console.log(`DRY-RUN POST ${API_BASE}/${uid}/threads_publish payload={ creation_id: "<container-id>" }`);
    process.exit(0);
  }

  // --- mock: zero fetch ---
  if (isMock) {
    const mode = args.mockMode || 'ok';
    if (mode === 'never-finishes') {
      const containerId = 'mock-container-never';
      console.log(`MOCK container id=${containerId}`);
      for (let i = 1; i <= POLL_MAX; i++) {
        console.log(`MOCK poll attempt ${i}/${POLL_MAX} status=IN_PROGRESS`);
      }
      console.error(`TIMEOUT container id=${containerId} status never FINISHED after ${POLL_MAX} attempts`);
      process.exit(2);
    }
    const containerId = 'mock-container-123';
    console.log(`MOCK container id=${containerId}`);
    console.log(`MOCK poll attempt 1/${POLL_MAX} status=IN_PROGRESS`);
    console.log(`MOCK poll attempt 2/${POLL_MAX} status=IN_PROGRESS`);
    console.log(`MOCK poll attempt 3/${POLL_MAX} status=FINISHED`);
    console.log(`MOCK published id=mock-media-456 creation_id=${containerId}`);
    console.log(`FINISHED id=mock-media-456`);
    process.exit(0);
  }

  // --- real branch: token required, never FAKE ---
  if (!token || token === 'FAKE' || token === 'PASTE_ME' || token === '') {
    console.error('MISSING THREADS_ACCESS_TOKEN (set env or threads-meta-test/.env)');
    process.exit(1);
  }

  const enc = encodeURIComponent;
  // 1. create container
  const createUrl = `${API_BASE}/${enc(uid)}/threads?access_token=${enc(token)}`;
  const createBody = new URLSearchParams({ media_type: 'TEXT', text });
  let containerId;
  try {
    const res = await fetch(createUrl, {
      method: 'POST',
      body: createBody,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`CREATE_FAILED status=${res.status} body=${JSON.stringify(json)}`);
      process.exit(1);
    }
    containerId = json.id;
    if (!containerId) {
      console.error(`CREATE_FAILED no container id body=${JSON.stringify(json)}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`CREATE_FAILED error=${e?.message ?? e}`);
    process.exit(1);
  }
  console.log(`container id=${containerId} status=CREATED`);

  // 2. poll until FINISHED
  let status = null;
  for (let i = 1; i <= POLL_MAX; i++) {
    await sleep(POLL_MS);
    try {
      const stUrl = `${API_BASE}/${enc(containerId)}?fields=status&access_token=${enc(token)}`;
      const res = await fetch(stUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      const json = await res.json().catch(() => ({}));
      status = json.status ?? json.status_code ?? null;
      console.log(`poll attempt ${i}/${POLL_MAX} status=${status ?? 'UNKNOWN'}`);
      if (status === 'FINISHED') break;
      if (status === 'ERROR' || status === 'EXPIRED') {
        console.error(`CONTAINER_FAILED id=${containerId} status=${status}`);
        process.exit(1);
      }
    } catch (e) {
      console.log(`poll attempt ${i}/${POLL_MAX} error=${e?.message ?? e}`);
    }
  }
  if (status !== 'FINISHED') {
    console.error(`TIMEOUT container id=${containerId} status=${status ?? 'UNKNOWN'} after ${POLL_MAX} attempts`);
    process.exit(2);
  }

  // 3. publish
  try {
    const pubUrl = `${API_BASE}/${enc(uid)}/threads_publish?access_token=${enc(token)}`;
    const pubBody = new URLSearchParams({ creation_id: containerId });
    const res = await fetch(pubUrl, {
      method: 'POST',
      body: pubBody,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`PUBLISH_FAILED status=${res.status} body=${JSON.stringify(json)}`);
      process.exit(1);
    }
    console.log(`FINISHED id=${json.id ?? ''} creation_id=${containerId}`);
    process.exit(0);
  } catch (e) {
    console.error(`PUBLISH_FAILED error=${e?.message ?? e}`);
    process.exit(1);
  }
}

await main();

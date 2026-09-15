import { existsSync } from 'node:fs';
import { readEnv } from './lib/env.mjs';

const ENDPOINT_DESC = 'GET /{threads-user-id}/threads_publishing_limit?fields=quota_usage,config,reply_quota_usage,reply_config';
const GRAPH_BASE = 'https://graph.threads.net/v1.0';

function printHelp() {
  console.log('Usage: node threads-meta-test/quota.mjs [--mock]');
  console.log('');
  console.log(`Reads (read-only): ${ENDPOINT_DESC}`);
  console.log(`Base: ${GRAPH_BASE}`);
  console.log('Quotas: 250 posts/24h, 1000 replies/24h, 100 follows/24h, 4800x impressions cap.');
  console.log('Stateless: no local counter, no file/DB writes.');
  console.log('');
  console.log('Example:');
  console.log('  node threads-meta-test/quota.mjs --mock');
  console.log('  THREADS_ACCESS_TOKEN=... THREADS_USER_ID=me node threads-meta-test/quota.mjs');
}

function maskToken(token) {
  if (!token || token.length <= 4) return '****';
  return `***${token.slice(-4)}`;
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const isMock = args.includes('--mock');

if (isMock) {
  console.log('used: 3/250');
  console.log('resets_at: mock (no network, stateless)');
  process.exit(0);
}

let env = {};
const envPath = 'threads-meta-test/.env';
if (existsSync(envPath)) {
  env = readEnv(envPath);
}
const token = process.env.THREADS_ACCESS_TOKEN ?? env.THREADS_ACCESS_TOKEN;
const uid = process.env.THREADS_USER_ID ?? process.env.THREADS_UID ?? env.THREADS_USER_ID ?? env.THREADS_UID ?? 'me';

if (!token || token === 'PASTE_ME' || token === '') {
  console.error('MISSING THREADS_ACCESS_TOKEN (.env not found or empty; copy threads-meta-test/.env.example to threads-meta-test/.env)');
  process.exit(1);
}
if (token === 'FAKE') {
  console.error('REFUSE FAKE TOKEN');
  process.exit(1);
}

const fields = 'quota_usage,config,reply_quota_usage,reply_config';
const url = `${GRAPH_BASE}/${uid}/threads_publishing_limit?fields=${fields}`;
console.log(`GET ${GRAPH_BASE}/${uid}/threads_publishing_limit (token ${maskToken(token)})`);

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(10000),
});
if (!res.ok) {
  console.error(`quota fetch failed: HTTP ${res.status}`);
  process.exit(1);
}
const json = await res.json();
const node = json?.data?.[0] ?? json;
const used = node?.quota_usage ?? node?.used ?? '?';
const resetsAt = node?.config?.reset_time ?? node?.resets_at ?? node?.reset_at ?? JSON.stringify(node?.config ?? '');
console.log(`used: ${used}/250`);
console.log(`resets_at: ${typeof resetsAt === 'string' ? resetsAt : JSON.stringify(resetsAt)}`);

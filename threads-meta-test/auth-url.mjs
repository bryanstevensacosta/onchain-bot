import { readEnv } from './lib/env.mjs';

const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  console.log('Usage: node threads-meta-test/auth-url.mjs [--dry-run]');
  console.log('');
  console.log('Build the Threads OAuth authorize URL (offline, no network).');
  console.log('Reads threads-meta-test/.env via lib/env.mjs (falls back to process.env).');
  console.log('');
  console.log('Example:');
  console.log('  node threads-meta-test/auth-url.mjs --dry-run');
  process.exit(0);
}

let fileEnv = {};
try {
  fileEnv = readEnv('threads-meta-test/.env');
} catch {
  fileEnv = {};
}

const env = { ...fileEnv, ...process.env };

const appId = (env.THREADS_APP_ID ?? '').trim();
if (!appId) {
  console.error('MISSING THREADS_APP_ID');
  process.exit(1);
}

const redirectUri = (env.THREADS_REDIRECT_URI ?? '').trim();
const scope = 'threads_basic,threads_content_publish';
const state = (env.THREADS_STATE ?? '').trim();

let url =
  'https://threads.net/oauth/authorize' +
  `?client_id=${appId}` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&scope=${scope}` +
  '&response_type=code';
if (state) url += `&state=${state}`;

console.log(url);

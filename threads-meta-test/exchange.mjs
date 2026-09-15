import { readEnv } from './lib/env.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SHORT_URL = 'https://graph.threads.net/oauth/access_token';
const LONG_URL_BASE = 'https://graph.threads.net/access_token';

function mask(s) {
  const v = String(s ?? '');
  if (v.length <= 4) return '***';
  return '***' + v.slice(-4);
}

function printHelp() {
  console.log('Usage: node threads-meta-test/exchange.mjs --code <CODE> [--mock] [--print-token]');
  console.log('');
  console.log('Pasos:');
  console.log('  1. POST https://graph.threads.net/oauth/access_token {client_id,client_secret,code,grant_type=authorization_code,redirect_uri} -> short-lived token + user_id');
  console.log('  2. GET https://graph.threads.net/access_token?grant_type=th_exchange_token -> long-lived token + expires_in');
  console.log('  3. Nota refresh: GET .../refresh_access_token?grant_type=th_refresh_token (solo si expires_in >= 24h; grant publico 90d auto-extiende, privada exige re-auth)');
  console.log('  --print-token: solo rama real, imprime LONG_TOKEN=<token completo> tras la linea enmascarada (aviso: queda en el historial del terminal; ejecuta con un espacio inicial o limpia el historial despues)');
  console.log('');
  console.log('Ejemplo:');
  console.log('  node threads-meta-test/exchange.mjs --code <CODE>');
  console.log('  node threads-meta-test/exchange.mjs --code FAKE --mock');
}

function parseArgs(argv) {
  const out = { code: null, mock: false, help: false, printToken: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--mock') out.mock = true;
    else if (a === '--print-token') out.printToken = true;
    else if (a === '--code') {
      out.code = argv[i + 1] ?? null;
      i++;
    }
  }
  return out;
}

function loadConfig() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(here, '.env');
  let env = {};
  try {
    env = readEnv(envPath);
  } catch {
    env = {};
  }
  const clientId = env.THREADS_APP_ID || process.env.THREADS_APP_ID || '';
  const clientSecret = env.THREADS_APP_SECRET || process.env.THREADS_APP_SECRET || '';
  const redirectUri = env.THREADS_REDIRECT_URI || process.env.THREADS_REDIRECT_URI || '';
  return { clientId, clientSecret, redirectUri };
}

function requireConfig({ clientId, clientSecret, redirectUri }) {
  if (!clientId) {
    console.error('MISSING THREADS_APP_ID (.env o env)');
    process.exit(1);
  }
  if (!clientSecret) {
    console.error('MISSING THREADS_APP_SECRET (.env o env)');
    process.exit(1);
  }
  if (!redirectUri) {
    console.error('MISSING THREADS_REDIRECT_URI (.env o env)');
    process.exit(1);
  }
}

function printRefreshNote(expiresIn) {
  const n = Number(expiresIn);
  if (Number.isFinite(n) && n >= 86400) {
    console.log('refresh: GET .../refresh_access_token?grant_type=th_refresh_token (expires_in >= 24h)');
    console.log('nota: grant publico 90d auto-extiende con refresh; privada exige re-auth');
  }
}

function runMock() {
  // Fixture en memoria, sin red y sin escribir nada.
  const shortLived = 'FAKE_SHORT';
  const userId = '123';
  const longLived = 'FAKE_LONG';
  const expiresIn = 5184000;
  console.log('[mock] paso 1 short: POST oauth/access_token (grant_type=authorization_code) -> short');
  console.log(`short=${mask(shortLived)} user_id=${mask(userId)}`);
  console.log('[mock] paso 2 short->long: GET access_token?grant_type=th_exchange_token -> long');
  console.log(`long=${mask(longLived)} expires_in=${expiresIn}`);
  printRefreshNote(expiresIn);
}

async function runReal(code, printToken) {
  const { clientId, clientSecret, redirectUri } = loadConfig();
  requireConfig({ clientId, clientSecret, redirectUri });
  // Paso 1: code -> short-lived token.
  const res1 = await fetch(SHORT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res1.ok) {
    console.error(`EXCHANGE FAILED short step HTTP ${res1.status}`);
    process.exit(1);
  }
  const j1 = await res1.json();
  const shortToken = j1.access_token || j1.short_lived || '';
  const userId = j1.user_id || j1.userId || '';
  if (!shortToken) {
    console.error('EXCHANGE FAILED sin access_token en paso short');
    process.exit(1);
  }
  console.log(`short=${mask(shortToken)} user_id=${mask(String(userId))}`);
  // Paso 2: short -> long-lived token.
  const u = new URL(LONG_URL_BASE);
  u.searchParams.set('grant_type', 'th_exchange_token');
  u.searchParams.set('client_secret', clientSecret);
  u.searchParams.set('access_token', shortToken);
  const res2 = await fetch(u.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res2.ok) {
    console.error(`EXCHANGE FAILED long step HTTP ${res2.status}`);
    process.exit(1);
  }
  const j2 = await res2.json();
  const longToken = j2.access_token || j2.long_lived || '';
  const expiresIn = j2.expires_in ?? j2.expiresIn ?? '';
  if (!longToken) {
    console.error('EXCHANGE FAILED sin access_token en paso long');
    process.exit(1);
  }
  console.log(`long=${mask(longToken)} expires_in=${expiresIn}`);
  if (printToken) {
    console.log(`LONG_TOKEN=${longToken}`);
  }
  printRefreshNote(expiresIn);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}
if (args.mock) {
  if (!args.code) {
    console.error('MISSING --code');
    process.exit(1);
  }
  runMock();
  process.exit(0);
}
if (!args.code) {
  console.error('MISSING --code');
  process.exit(1);
}
if (args.code === 'FAKE') {
  console.error('REFUSE FAKE TOKEN');
  process.exit(1);
}
await runReal(args.code, args.printToken);

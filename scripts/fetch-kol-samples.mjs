#!/usr/bin/env node
// scripts/fetch-kol-samples.mjs
//
// One-off competitive-intelligence script: descarga los últimos N mensajes de
// KOLs específicos de Telegram y los guarda en docs-money/kols/<id>/ para
// que tengas referencia del formato (texto + URLs incrustadas).
//
// NO es parte del pipeline. NO se integra con el backend. Después de usar,
// borra este script y los datos descargados (ver docs-money/scripts/fetch-kol-samples.md).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { kols: [], limit: 50, output: 'docs-money/kols', interactive: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--kol') out.kols.push(argv[++i]);
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10);
    else if (a === '--output') out.output = argv[++i];
    else if (a === '--interactive') out.interactive = true;
    else if (a === '--help' || a === '-h') {
      console.log('Uso: node scripts/fetch-kol-samples.mjs --kol <id> [--kol <id> ...] [--limit 50] [--output docs-money/kols]');
      process.exit(0);
    }
    else throw new Error(`Flag desconocida: ${a}`);
  }
  if (out.kols.length === 0) throw new Error('Debes pasar al menos un --kol <id>');
  if (out.limit > 200) throw new Error('--limit máximo 200 (hard cap para one-off research)');
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// .env loader (manual, no depende de dotenv)
// ─────────────────────────────────────────────────────────────────────────────

async function loadEnv() {
  const candidates = [
    path.join(REPO_ROOT, '.env'),
    path.join(REPO_ROOT, 'apps', 'backend', '.env'),
  ];
  const env = {};
  for (const envPath of candidates) {
    try {
      const raw = await fs.readFile(envPath, 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
        if (!m) continue;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        env[m[1]] = v;
      }
    } catch {
      // file no existe, probar siguiente
    }
  }
  return env;
}

// ─────────────────────────────────────────────────────────────────────────────
// Peer resolver: prueba varias formas de ID
// ─────────────────────────────────────────────────────────────────────────────

async function resolvePeer(client, rawId) {
  const candidates = [String(rawId)];
  if (/^\d+$/.test(rawId)) {
    candidates.push(`-100${rawId}`);
    candidates.push(`-${rawId}`);
  }
  for (const candidate of candidates) {
    try {
      const entity = await client.getEntity(candidate);
      return { entity, resolvedAs: candidate };
    } catch {
      // try next
    }
  }
  throw new Error(`No se pudo resolver peer id=${rawId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// URL extraction: entities de Telegram + regex fallback
// ─────────────────────────────────────────────────────────────────────────────

function utf16Slice(text, offset, length) {
  // Telegram offsets son UTF-16 code units (no UTF-8 bytes).
  // JS strings ya son UTF-16 internamente, así que substring es correcto.
  return text.substring(offset, offset + length);
}

const RE_MD_V1 = /\(([^()]+?)\)\[([^\]\s]+?)\]/g;          // (texto)[url]
const RE_MD_V2 = /\[([^\]\n]+?)\]\(([^\s)]+?)\)/g;          // [texto](url)
const RE_BARE  = /\bhttps?:\/\/[^\s)\]]+/g;                  // bare URL
const RE_TME   = /\bt\.me\/[A-Za-z0-9_+\-/]+/g;             // t.me links

function extractUrls(message) {
  const out = [];
  const text = message.message ?? '';
  const messageId = message.id;

  // 1. Entities de Telegram (más confiable)
  for (const entity of message.entities ?? []) {
    if (entity.className === 'MessageEntityTextUrl') {
      out.push({
        text: utf16Slice(text, entity.offset, entity.length),
        url: entity.url,
        source: 'entity_text_url',
        messageId,
      });
    } else if (entity.className === 'MessageEntityUrl') {
      out.push({
        text: utf16Slice(text, entity.offset, entity.length),
        url: utf16Slice(text, entity.offset, entity.length),
        source: 'entity_url',
        messageId,
      });
    }
  }

  // 2. Regex fallback (cubre casos donde el entity se perdió)
  let m;
  RE_MD_V1.lastIndex = 0;
  while ((m = RE_MD_V1.exec(text)) !== null) {
    out.push({ text: m[1], url: m[2], source: 'regex_md_v1', messageId });
  }
  RE_MD_V2.lastIndex = 0;
  while ((m = RE_MD_V2.exec(text)) !== null) {
    out.push({ text: m[1], url: m[2], source: 'regex_md_v2', messageId });
  }
  RE_BARE.lastIndex = 0;
  while ((m = RE_BARE.exec(text)) !== null) {
    out.push({ text: m[0], url: m[0], source: 'regex_bare', messageId });
  }
  RE_TME.lastIndex = 0;
  while ((m = RE_TME.exec(text)) !== null) {
    out.push({ text: m[0], url: 'https://' + m[0], source: 'regex_tme', messageId });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary generator
// ─────────────────────────────────────────────────────────────────────────────

function buildSummary({ kolId, resolvedAs, entity, messages, urls }) {
  const total = messages.length;
  const withUrls = new Set(urls.map(u => u.messageId)).size;
  const bySource = urls.reduce((acc, u) => {
    acc[u.source] = (acc[u.source] || 0) + 1;
    return acc;
  }, {});
  const lengths = messages.map(m => (m.message ?? '').length);
  const avgLen = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0;
  const withMedia = messages.filter(m => m.media).length;

  const example = messages.find(m => (m.message ?? '').length > 50);
  const exampleAnonymized = example
    ? example.message.replace(/0x[a-fA-F0-9]{40}/g, '0x<CA>').replace(/https?:\/\/\S+/g, '<URL>').substring(0, 400)
    : '(no hay mensajes con suficiente longitud para ejemplo)';

  return [
    `# KOL ${kolId} — formato analizado`,
    ``,
    `- Tipo: ${entity.className}`,
    `- Title: ${entity.title ?? entity.firstName ?? '(sin título)'}`,
    `- Username: @${entity.username ?? '(sin username)'}`,
    `- Resolved as: ${resolvedAs}`,
    `- Mensajes muestreados: ${total}`,
    `- Mensajes con URLs: ${withUrls} (${total ? Math.round(withUrls * 100 / total) : 0}%)`,
    `- Mensajes con media: ${withMedia} (${total ? Math.round(withMedia * 100 / total) : 0}%)`,
    `- URLs extraídas por fuente:`,
    ...Object.entries(bySource).map(([k, v]) => `  - ${k}: ${v}`),
    `- Longitud media: ${avgLen} chars`,
    ``,
    `## Ejemplo anonimizado`,
    ``,
    '```',
    exampleAnonymized,
    '```',
    ``,
    `## Regex base recomendado`,
    ``,
    '```js',
    `// MarkdownV1: (texto)[url]`,
    `const RE_MD_V1 = /\\(([^()]+?)\\)\\[([^\\]\\s]+?)\\]/g;`,
    ``,
    `// MarkdownV2: [texto](url)`,
    `const RE_MD_V2 = /\\[([^\\]\\n]+?)\\]\\(([^\\s)]+?)\\)/g;`,
    ``,
    `// Bare URL`,
    `const RE_BARE = /\\bhttps?:\\/\\/[^\\s)\\]]+/g;`,
    ``,
    `// t.me links`,
    `const RE_TME = /\\bt\\.me\\/[A-Za-z0-9_+\\-/]+/g;`,
    `// ↑ ajústalo según lo que veas arriba`,
    '```',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const env = await loadEnv();

  const apiId = parseInt(env.TELEGRAM_MTPROTO_API_ID ?? '0', 10);
  const apiHash = env.TELEGRAM_MTPROTO_API_HASH ?? '';
  let sessionString = env.TELEGRAM_MTPROTO_SESSION ?? '';

  if (!apiId || !apiHash) {
    console.error('Faltan TELEGRAM_MTPROTO_API_ID / _HASH en .env');
    process.exit(1);
  }

  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.connect();

  if (!sessionString) {
    if (!args.interactive) {
      console.error('TELEGRAM_MTPROTO_SESSION vacío. Pasa --interactive o autentica primero.');
      await client.disconnect();
      process.exit(1);
    }
    await client.start({
      phoneNumber: async () => await prompt('Phone: '),
      password: async () => await prompt('2FA password (si aplica): '),
      phoneCode: async () => await prompt('Code: '),
    });
    console.log('Nueva session string (guárdala en .env como TELEGRAM_MTPROTO_SESSION):');
    console.log(client.session.save());
  }

  // Limita rate para evitar FloodWait
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const delayBetweenKolsMs = 5000;
  const delayBetweenMsgBatchesMs = 100;

  for (const kolId of args.kols) {
    console.log(`\n=== Procesando KOL ${kolId} ===`);
    try {
      const { entity, resolvedAs } = await resolvePeer(client, kolId);
      console.log(`  Resolved: ${entity.className} "${entity.title ?? entity.firstName ?? ''}" as ${resolvedAs}`);

      const messages = await client.getMessages(entity, { limit: args.limit });
      console.log(`  Fetched ${messages.length} mensajes`);

      const urls = messages.flatMap(extractUrls);
      console.log(`  Extraídas ${urls.length} URLs`);

      const slug = String(kolId);
      const outDir = path.join(REPO_ROOT, args.output, slug);
      await fs.mkdir(outDir, { recursive: true });

      // Sanitizar: guardar mensaje SIN `message` field para reducir superficie
      // (mantenemos message porque el script es de research; el user lo borrará después)
      const rawForJson = messages.map(m => ({
        id: m.id,
        date: m.date,
        from_id: m.fromId?.userId ?? m.fromId?.channelId ?? null,
        message: m.message,
        entities: m.entities?.map(e => ({
          className: e.className,
          offset: e.offset,
          length: e.length,
          url: e.url,
        })),
        media: m.media ? { className: m.media.className } : null,
      }));

      await fs.writeFile(
        path.join(outDir, 'raw.json'),
        JSON.stringify(rawForJson, null, 2),
      );
      await fs.writeFile(
        path.join(outDir, 'urls.json'),
        JSON.stringify(urls, null, 2),
      );
      await fs.writeFile(
        path.join(outDir, 'summary.md'),
        buildSummary({ kolId, resolvedAs, entity, messages, urls }),
      );

      console.log(`  Guardado en ${outDir}`);
    } catch (err) {
      console.error(`  ERROR procesando ${kolId}:`, err.message);
    }

    await sleep(delayBetweenKolsMs);
  }

  await client.disconnect();
  console.log('\n✓ Listo. Recuerda borrar docs-money/kols/<id>/ después de usar.');
}

async function prompt(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    process.stdin.once('data', (data) => resolve(data.toString().trim()));
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

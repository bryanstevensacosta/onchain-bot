import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GATEWAY_DIR = join(__dirname, 'infrastructure', 'gateway');
const DOMAIN_PORT = join(__dirname, 'domain', 'ports');
const SERVICES_DIR = join(__dirname, 'application', 'services');

function readTree(dir: string): Array<{ file: string; content: string }> {
  const out: Array<{ file: string; content: string }> = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...readTree(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
      out.push({ file: full, content: readFileSync(full, 'utf8') });
    }
  }
  return out;
}

const TOKEN_PATTERNS = [
  /CRYPTO_NEWS_BOT_TOKEN['"]?\s*[:=]/,
  /THREADS_BOT_TOKEN['"]?\s*[:=]/,
  /bot\d{4,}:[A-Za-z0-9_-]{20,}/,
  /decryptToken\s*\(/,
  /encryptedToken/,
];

/**
 * Secret-scan gate (telegram-bots-gateway todo 5).
 *
 * The gateway client path must never carry plaintext bot tokens: only
 * vault ids travel (`botId`), the gateway decrypts server-side. Env
 * token NAMES may appear as mapping labels (identity, not value), but
 * no token VALUES, no ciphertext, and no vault decrypt calls belong in
 * the gateway, parity, or migration-response code.
 */
describe('feed-publisher gateway secret-scan', () => {
  it('carries no token values, ciphertext, or decrypt calls', () => {
    const files = [
      ...readTree(GATEWAY_DIR),
      ...readTree(DOMAIN_PORT).filter((row) =>
        row.file.includes('bots-gateway-sender'),
      ),
      ...readTree(SERVICES_DIR).filter((row) =>
        row.file.includes('dual-send-parity'),
      ),
    ];
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const { file, content } of files) {
      for (const pattern of TOKEN_PATTERNS) {
        if (pattern.test(content)) {
          hits.push(`${file} matches ${String(pattern)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('migration responses carry labels/ids only (no token field)', () => {
    const files = readTree(join(__dirname, 'application', 'use-cases')).filter(
      (row) => row.file.includes('migrate-bots-to-gateway'),
    );
    expect(files.length).toBe(1);
    const content = files[0]?.content ?? '';
    expect(content).not.toMatch(/token:\s*plaintext/);
    expect(content).not.toMatch(/"token":\s*token/);
  });
});

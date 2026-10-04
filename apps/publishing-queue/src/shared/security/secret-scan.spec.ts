/**
 * Secret-scan gate (todo 14, P50).
 *
 * Fails the suite when committed source carries live secret material:
 * Telegram bot tokens, private keys, cloud keys, provider keys, or
 * Slack tokens. Env VAR NAMES (e.g. CRYPTO_NEWS_BOT_TOKEN) are fine —
 * only VALUES match these shapes. Fixtures use `iv:tag:data`-style
 * placeholders that never match.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_ROOT = path.resolve(__dirname, '..', '..');

const FORBIDDEN: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'telegram-bot-token', pattern: /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/ },
  { name: 'private-key', pattern: /\bBEGIN (?:RSA )?PRIVATE KEY\b/ },
  { name: 'github-token', pattern: /\bghp_[A-Za-z0-9]{20,}/ },
  { name: 'openai-live-key', pattern: /\bsk-(?:live|proj)-[A-Za-z0-9]{10,}/ },
  { name: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'slack-token', pattern: /\bxox[bpas]-[A-Za-z0-9-]+\b/ },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('secret-scan gate (todo 14, P50)', () => {
  it('finds no live secret material in committed source', () => {
    const hits: string[] = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const { name, pattern } of FORBIDDEN) {
        if (pattern.test(content)) {
          hits.push(`${path.relative(SRC_ROOT, file)}: ${name}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

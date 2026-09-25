import * as fs from 'node:fs';
import * as path from 'node:path';

const AUTH_DIR = path.join(__dirname);
const GUARD = path.join(__dirname, '..', 'shared', 'infrastructure', 'guards', 'api-key.guard.ts');
const SECRET_PATTERNS = [/md_[A-Za-z0-9_-]{10,}/, /sk-[A-Za-z0-9]{8,}/];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('log-secret scan (P46 grep gate)', () => {
  it('no key material or plaintext-key logging in auth sources, guard, or controller', () => {
    const files = [...walk(AUTH_DIR), GUARD].filter((f) => fs.existsSync(f));
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const pat of SECRET_PATTERNS) {
        if (pat.test(src)) {
          violations.push(`${file}: embedded secret-like literal`);
        }
      }
      const lines = src.split('\n');
      lines.forEach((line, idx) => {
        const hasKeyVar = /\b(plaintext|rawKey|apiKey|api_key)\b/i.test(line);
        const logsIt = /\b(console\.(log|warn|error|debug)|this\.logger\.(log|warn|error|debug|verbose))\s*\(/.test(line);
        if (hasKeyVar && logsIt) {
          violations.push(`${file}:${idx + 1}: possible key material in log call: ${line.trim().slice(0, 120)}`);
        }
      });
      if (/res\.json\s*\([^)]*plaintext/i.test(src)) {
        violations.push(`${file}: plaintext in res.json response`);
      }
      if (file.endsWith('api-key.controller.ts')) {
        const lines = src.split('\n');
        const methodStarts: Array<{ name: string; line: number }> = [];
        lines.forEach((line, idx) => {
          const m = /public async? (\w+)\(/.exec(line);
          if (m) {
            methodStarts.push({ name: m[1], line: idx });
          }
        });
        const methodOf = (idx: number): string => {
          let current = '<top>';
          for (const s of methodStarts) {
            if (s.line <= idx) {
              current = s.name;
            }
          }
          return current;
        };
        lines.forEach((line, idx) => {
          if (/\bplaintext\b/.test(line) && !/^\s*(\*|\/\/)/.test(line)) {
            const owner = methodOf(idx);
            if (owner !== 'create' && owner !== 'rotate') {
              violations.push(`${file}:${idx + 1}: plaintext reference outside create/rotate (${owner})`);
            }
          }
        });
      }
    }
    expect(violations).toEqual([]);
  });
});

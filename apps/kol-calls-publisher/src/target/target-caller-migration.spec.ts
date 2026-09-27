import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const SRC = join(__dirname, '..');
const LEGACY_ROOT = join(SRC, 'telegram');

function readTree(dir: string): Array<{ file: string; content: string }> {
  const out: Array<{ file: string; content: string }> = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...readTree(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
      out.push({ file: full, content: readFileSync(full, 'utf8') });
    }
  }
  return out;
}

function legacyImports(file: string, content: string): string[] {
  const hits: string[] = [];
  const pattern = /from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const spec = match[1] ?? '';
    if (!spec.startsWith('.')) continue;
    const resolved = resolve(dirname(file), spec);
    const rel = relative(LEGACY_ROOT, resolved);
    if (rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep))) {
      hits.push(spec);
    }
  }
  return hits;
}

/**
 * Caller-migration gate (threads-publisher plan Fase 2 todo 10,
 * adversarial: broken caller suite).
 *
 * `target/` replaces `telegram/` + the threads stub as the delivery
 * surface: publishing callers resolve through `src/target/` (the
 * dispatcher or the `telegram-ports` barrel), never import the
 * legacy `src/telegram/` tree directly. Module wiring
 * (`*.module.ts`) may still import the legacy *Module classes during
 * the deprecation window (todo 11 deletes them); every other file
 * must not. `src/target/` internals (dispatcher, client, barrel)
 * and `src/telegram/` internals are exempt (they own the legs).
 * Own-subtree helpers (`templates/infrastructure/telegram/`) are
 * exempt — only the top-level `src/telegram/` tree is gated.
 */
describe('kol-calls-publisher target caller migration', () => {
  it('no caller outside target/ imports the legacy telegram tree', () => {
    const files = readTree(SRC).filter(
      (row) =>
        !row.file.includes(`${join(SRC, 'target')}${sep}`) &&
        !row.file.includes(`${join(SRC, 'telegram')}${sep}`) &&
        !row.file.endsWith('.module.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    const hits = files.flatMap((row) =>
      legacyImports(row.file, row.content).map(
        (spec) => `${row.file} -> ${spec}`,
      ),
    );
    expect(hits).toEqual([]);
  });
});

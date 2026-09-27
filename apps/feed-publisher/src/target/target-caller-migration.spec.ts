import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

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

const LEGACY_IMPORT = /from\s+['"][^'"]*(telegram|threads)\//;

/**
 * Caller-migration gate (threads-publisher plan Fase 2 todo 10,
 * adversarial: broken caller suite).
 *
 * `target/` replaces `telegram/` + `threads/` as the delivery
 * surface: sessions, queue and template callers must resolve through
 * `src/target/`, never import the legacy trees directly. Module
 * wiring (`*.module.ts`) may still import the legacy *Module classes
 * during the deprecation window (todo 11 deletes them); every other
 * file must not. `src/target/` itself, `src/telegram/` and
 * `src/threads/` internals are exempt (they own the legs).
 */
describe('feed-publisher target caller migration', () => {
  it('no caller outside target/ imports the legacy telegram/threads trees', () => {
    const files = readTree(SRC).filter(
      (row) =>
        !row.file.includes(
          `${join(SRC, 'target')}${require('node:path').sep}`,
        ) &&
        !row.file.includes(
          `${join(SRC, 'telegram')}${require('node:path').sep}`,
        ) &&
        !row.file.includes(
          `${join(SRC, 'threads')}${require('node:path').sep}`,
        ) &&
        !row.file.endsWith('.module.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    const hits = files
      .filter((row) => LEGACY_IMPORT.test(row.content))
      .map((row) => row.file);
    expect(hits).toEqual([]);
  });
});

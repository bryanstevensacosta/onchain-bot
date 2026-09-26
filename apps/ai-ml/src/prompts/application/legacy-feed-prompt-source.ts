import { Injectable } from '@nestjs/common';
import { extractVariables, type PromptContentType, type PromptTemplate } from '../domain/prompt-template';

/**
 * LegacyFeedPromptSource (ai-ml, todo 1): read-only migration snapshot
 * of the feed-publisher GLOBAL template catalog.
 *
 * Copied by hand from
 * `apps/feed-publisher/src/llm/infrastructure/persistence/in-memory/
 * in-memory-prompt-template.repository.ts` (seed `default-feed`) —
 * never imported, so feed-publisher stays the migration source of
 * truth until its todo 3 repoints it at ai-ml. The dual-read resolver
 * serves these rows with `source: 'legacy-fallback'` ONLY when the
 * ai-ml catalog has no row for the name; the moment an operator
 * creates/imports the name in ai-ml, the ai-ml row wins.
 */
interface LegacyRow {
  readonly name: string;
  readonly content: string;
  readonly systemContent: string;
  readonly contentType: PromptContentType;
}

const LEGACY_SNAPSHOT: ReadonlyArray<LegacyRow> = [
  {
    name: 'default-feed',
    content:
      'Rewrite the following crypto news for a Telegram channel, in Spanish, keeping facts intact:\n\n{{original}}',
    systemContent: 'You are a concise crypto-news editor.',
    contentType: 'global',
  },
];

@Injectable()
export class LegacyFeedPromptSource {
  private readonly rows = new Map<string, LegacyRow>(
    LEGACY_SNAPSHOT.map((row) => [row.name, row]),
  );

  /** Names available via the legacy fallback (migration inventory). */
  public legacyNames(): ReadonlyArray<string> {
    return [...this.rows.keys()];
  }

  /** Snapshot row as a version-1 template view, or null. */
  public findByName(name: string): PromptTemplate | null {
    const row = this.rows.get(name);
    if (!row) {
      return null;
    }
    const variables = extractVariables(row.content, row.systemContent);
    const stamp = new Date(0).toISOString();
    return {
      id: `legacy:${row.name}`,
      name: row.name,
      version: 1,
      content: row.content,
      systemContent: row.systemContent,
      variables: [...variables],
      contentType: row.contentType,
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
    };
  }
}

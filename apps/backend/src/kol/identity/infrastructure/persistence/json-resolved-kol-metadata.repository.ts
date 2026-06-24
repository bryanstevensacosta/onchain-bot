import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  CachedKolMetadata,
  ResolvedKolMetadataRepository,
} from 'kol/identity/application/ports/resolved-kol-metadata.repository';

/**
 * File-backed implementation of ResolvedKolMetadataRepository.
 *
 * Stores a single JSON document at `<filePath>` with shape:
 *   { version: 1, entries: CachedKolMetadata[] }
 *
 * The path is configurable via INGESTION_TELEGRAM_METADATA_CACHE_FILE.
 * Defaults to `<repo-root>/.cache/telegram-kol-metadata.json` so the
 * cache survives process restarts but is git-ignored.
 *
 * Concurrency: a per-instance write mutex serializes upserts to avoid
 * lost updates. Reads are lock-free and tolerant of a missing file.
 *
 * Failure policy: corrupt JSON or IO errors are logged and treated as
 * an empty cache rather than thrown — the cache is a best-effort
 * optimization, not a source of truth.
 */
@Injectable()
export class JsonResolvedKolMetadataRepository extends ResolvedKolMetadataRepository {
  private readonly logger = new Logger(JsonResolvedKolMetadataRepository.name);
  private readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();
  private cache: Map<string, CachedKolMetadata> | null = null;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }

  public async find(kolId: string): Promise<CachedKolMetadata | null> {
    const entries = await this.findAll();
    return entries.find((e) => e.kolId === kolId) ?? null;
  }

  public async findAll(): Promise<ReadonlyArray<CachedKolMetadata>> {
    const map = await this.load();
    return Array.from(map.values());
  }

  public async upsert(entry: CachedKolMetadata): Promise<void> {
    this.writeChain = this.writeChain.then(() => this.persistEntry(entry));
    await this.writeChain;
  }

  private async persistEntry(entry: CachedKolMetadata): Promise<void> {
    const map = await this.load();
    map.set(entry.kolId, entry);
    await this.writeAll(map);
  }

  private async load(): Promise<Map<string, CachedKolMetadata>> {
    if (this.cache) {
      return this.cache;
    }
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        version?: number;
        entries?: CachedKolMetadata[];
      };
      const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
      this.cache = new Map(
        entries
          .filter(
            (e): e is CachedKolMetadata =>
              !!e &&
              typeof e.kolId === 'string' &&
              typeof e.title === 'string' &&
              typeof e.resolvedAt === 'string' &&
              typeof e.source === 'string',
          )
          .map((e) => [e.kolId, e]),
      );
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        this.logger.warn(
          `Failed to read kol metadata cache at ${this.filePath}; starting empty. (${(err as Error).message})`,
        );
      }
      this.cache = new Map();
    }
    return this.cache;
  }

  private async writeAll(map: Map<string, CachedKolMetadata>): Promise<void> {
    this.cache = map;
    const payload = {
      version: 1,
      entries: Array.from(map.values()),
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(
      this.filePath,
      JSON.stringify(payload, null, 2),
      'utf-8',
    );
  }
}

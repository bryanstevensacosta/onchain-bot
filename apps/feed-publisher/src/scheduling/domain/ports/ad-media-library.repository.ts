import { AdMediaLibraryEntry } from '../ad-media-library-entry.entity';

/** Outbound port: shared scheduling media library (FK-less, content-deduped). */
export abstract class AdMediaLibraryRepository {
  public abstract findAll(): Promise<ReadonlyArray<AdMediaLibraryEntry>>;
  public abstract findById(id: string): Promise<AdMediaLibraryEntry | null>;
  public abstract findByContentHash(
    contentHash: string,
  ): Promise<AdMediaLibraryEntry | null>;
  public abstract save(
    entry: AdMediaLibraryEntry,
  ): Promise<AdMediaLibraryEntry>;
  public abstract delete(id: string): Promise<void>;
}

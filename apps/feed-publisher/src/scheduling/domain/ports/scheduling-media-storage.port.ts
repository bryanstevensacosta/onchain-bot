/**
 * Outbound port: disk storage for scheduling media.
 *
 * Writes per-post files under `ads/<adId>/<uuid>.<ext>` and shared
 * library files under `ads-library/<contentHash>.<ext>`, returning
 * paths RELATIVE to the uploads root (the only form the application
 * layer ever sees). `remove`/`readFile` resolve relative paths only:
 * absolute or `..`-escaping inputs throw rather than touching
 * anything outside the uploads root.
 */
export abstract class SchedulingMediaStoragePort {
  public abstract store(
    adId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ relativePath: string; size: number }>;
  public abstract storeLibraryFile(
    buffer: Buffer,
    mimeType: string,
    contentHash: string,
  ): Promise<{ relativePath: string; size: number }>;
  public abstract remove(relativePath: string): Promise<void>;
  public abstract readFile(relativePath: string): Promise<Buffer>;
}

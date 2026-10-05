/**
 * Queue depth reader (R-b1, matching side).
 *
 * The unified queue moved to `apps/publishing-queue/`; matching keeps
 * only this read surface for its health view. Unbound (null) until the
 * B1 dual provides the HTTP reader — the health view reports 0 depth
 * meanwhile. Queue writer path: `MatchedMessageEnqueuePort` (collector
 * binding since R-b1).
 */
export abstract class QueueDepthReader {
  public abstract counts(): Promise<{ readonly pending: number }>;
}

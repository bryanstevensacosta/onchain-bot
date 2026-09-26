export interface ResolvedContentRef {
  readonly text: string;
  readonly mediaIds: string[];
}

/**
 * `content-ref` resolution (contract §2: scheduler resolves via queue
 * port; never raw feed text by id-spoof). Unresolvable at schedule
 * time → 422 UNKNOWN_CONTENT_REF; gone at fire time → failed
 * CONTENT_REF_GONE. v1 is in-memory (queue entries live in
 * feed-publisher; the HTTP resolver is the cutover follow-up).
 */
export abstract class ContentRefResolver {
  public abstract resolve(queueEntryId: string): Promise<ResolvedContentRef | null>;
  public abstract seed(entryId: string, resolved: ResolvedContentRef): Promise<void>;
}

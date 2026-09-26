import {
  ContentRefResolver,
  type ResolvedContentRef,
} from '../../domain/ports/content-ref.resolver';

export class InMemoryContentRefResolver extends ContentRefResolver {
  private readonly rows = new Map<string, ResolvedContentRef>();

  public async resolve(queueEntryId: string): Promise<ResolvedContentRef | null> {
    return this.rows.get(queueEntryId) ?? null;
  }

  public async seed(entryId: string, resolved: ResolvedContentRef): Promise<void> {
    this.rows.set(entryId, { ...resolved, mediaIds: [...resolved.mediaIds] });
  }
}

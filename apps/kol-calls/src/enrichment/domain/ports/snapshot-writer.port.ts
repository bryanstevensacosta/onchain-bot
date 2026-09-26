import { MentionSnapshot } from '../../../snapshot/domain/entities/mention-snapshot.entity';

/**
 * SnapshotWriterPort — enrichment writes completed snapshots through this
 * port (P27: the `mention_snapshots` entity is OWNED by `src/snapshot/`,
 * same kol-calls DB; enrichment never touches the table directly).
 */
export abstract class SnapshotWriterPort {
  public abstract save(snapshot: MentionSnapshot): Promise<void>;
}

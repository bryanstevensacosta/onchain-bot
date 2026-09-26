import { ScheduledPost } from '../../../domain/scheduled-post.entity';
import type { ScheduledPostProps } from '../../../domain/scheduled-post.entity';
import { ScheduledPostOrmEntity } from './scheduled-post.orm-entity';

/**
 * scheduled_posts row <-> ScheduledPost aggregate (UNWIRED, GAP-1).
 * Dates cross as ISO strings on the domain side; content/binding/
 * scheduleKind cross as JSON snapshots.
 */
export class ScheduledPostTypeormMapper {
  public static toOrm(post: ScheduledPost): ScheduledPostOrmEntity {
    const snap = post.toSnapshot();
    const row = new ScheduledPostOrmEntity();
    row.id = snap.id;
    row.sessionId = snap.sessionId;
    row.binding = { ...snap.binding };
    row.content = JSON.parse(JSON.stringify(snap.content)) as Record<string, unknown>;
    row.scheduleKind = JSON.parse(JSON.stringify(snap.scheduleKind)) as Record<string, unknown>;
    row.idempotencyKey = snap.idempotencyKey;
    row.state = snap.state;
    row.messageId = snap.messageId;
    row.firedAt = snap.firedAt ? new Date(snap.firedAt) : null;
    row.reason = snap.reason;
    row.lastFiredAt = snap.lastFiredAt ? new Date(snap.lastFiredAt) : null;
    row.createdAt = new Date(snap.createdAt);
    row.updatedAt = new Date(snap.updatedAt);
    return row;
  }

  public static toDomain(row: ScheduledPostOrmEntity): ScheduledPost {
    const toIso = (value: Date | string | null): string | null =>
      value === null ? null : new Date(value).toISOString();
    const props: ScheduledPostProps = {
      id: row.id,
      sessionId: row.sessionId,
      binding: {
        target: row.binding.target as 'telegram' | 'threads',
        bindingId: row.binding.bindingId,
        botId: row.binding.botId,
        chatId: row.binding.chatId,
      },
      content: row.content as unknown as ScheduledPostProps['content'],
      scheduleKind: row.scheduleKind as unknown as ScheduledPostProps['scheduleKind'],
      idempotencyKey: row.idempotencyKey,
      state: row.state as ScheduledPostProps['state'],
      messageId: row.messageId,
      firedAt: toIso(row.firedAt),
      reason: row.reason,
      lastFiredAt: toIso(row.lastFiredAt),
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
    return ScheduledPost.fromSnapshot(props);
  }
}

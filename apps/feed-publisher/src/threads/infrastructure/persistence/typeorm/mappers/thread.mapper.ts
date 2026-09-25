import { Thread, type ThreadSnapshot } from '../../../../domain/entities/thread.entity';
import type { ThreadMessageSnapshot } from '../../../../domain/entities/thread-message.entity';
import { ThreadOrmEntity } from '../thread.orm-entity';
import { ThreadMessageOrmEntity } from '../thread-message.orm-entity';

/**
 * Domain <-> TypeORM mapper for threads (unwired, GAP-1).
 *
 * Round-trips through `Thread.toSnapshot()` / `Thread.rehydrate()`
 * so the ORM layer never reconstructs transitions by hand.
 */
export function toThreadOrm(thread: Thread): {
  threadRow: ThreadOrmEntity;
  messageRows: ThreadMessageOrmEntity[];
} {
  const snapshot = thread.toSnapshot();
  const threadRow = new ThreadOrmEntity();
  threadRow.id = snapshot.id;
  threadRow.status = snapshot.status;
  threadRow.messagesPublished = snapshot.messagesPublished;
  threadRow.lastPublishedMessageIndex = snapshot.lastPublishedMessageIndex;
  threadRow.attempts = snapshot.attempts;
  threadRow.failureReason = snapshot.failureReason;
  threadRow.nextAttemptAt =
    snapshot.nextAttemptAt === null ? null : new Date(snapshot.nextAttemptAt);
  threadRow.createdAt = new Date(snapshot.createdAt);
  threadRow.updatedAt = new Date(snapshot.updatedAt);
  const messageRows = snapshot.messages.map((message) =>
    toMessageOrm(message),
  );
  return { threadRow, messageRows };
}

export function toMessageOrm(
  snapshot: ThreadMessageSnapshot,
): ThreadMessageOrmEntity {
  const row = new ThreadMessageOrmEntity();
  row.id = snapshot.id;
  row.threadId = snapshot.threadId;
  row.idx = snapshot.index;
  row.content = snapshot.content;
  row.mediaUrls = snapshot.mediaUrls.length > 0 ? snapshot.mediaUrls : null;
  row.delaySeconds = snapshot.delaySeconds;
  row.publishedAt =
    snapshot.publishedAt === null ? null : new Date(snapshot.publishedAt);
  row.remoteId = snapshot.remoteId;
  return row;
}

export function fromThreadOrm(
  threadRow: ThreadOrmEntity,
  messageRows: ThreadMessageOrmEntity[],
): Thread {
  const snapshot: ThreadSnapshot = {
    id: threadRow.id,
    status: threadRow.status as ThreadSnapshot['status'],
    messages: [...messageRows]
      .sort((a, b) => a.idx - b.idx)
      .map((row) => ({
        id: row.id,
        threadId: row.threadId,
        index: row.idx,
        content: row.content,
        mediaUrls: [...(row.mediaUrls ?? [])],
        delaySeconds: row.delaySeconds,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        remoteId: row.remoteId,
      })),
    messagesPublished: threadRow.messagesPublished,
    lastPublishedMessageIndex: threadRow.lastPublishedMessageIndex,
    attempts: threadRow.attempts,
    failureReason: threadRow.failureReason,
    nextAttemptAt: threadRow.nextAttemptAt
      ? threadRow.nextAttemptAt.toISOString()
      : null,
    createdAt: threadRow.createdAt.toISOString(),
    updatedAt: threadRow.updatedAt.toISOString(),
  };
  return Thread.rehydrate(snapshot);
}

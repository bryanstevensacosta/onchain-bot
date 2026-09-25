import { MentionSnapshot } from '../../domain/entities/mention-snapshot.entity';
import { InMemoryMentionSnapshotRepository } from './in-memory-mention-snapshot.repository';

const BASE = {
  mentionId: 'kol-a:1:0',
  kolId: 'kol-a',
  messageId: 1,
  contractIndex: 0,
  contractAddress: `0x${'a'.repeat(40)}`,
  chain: 'evm',
  occurred_at_telegram: new Date('2026-09-25T12:00:00.000Z'),
  ingested_at_kol: new Date('2026-09-25T12:00:05.000Z'),
  enriched_at: new Date('2026-09-25T12:00:06.000Z'),
};

describe('InMemoryMentionSnapshotRepository', () => {
  it('save + findByMentionId round-trip', async () => {
    const repo = new InMemoryMentionSnapshotRepository();

    await repo.save(MentionSnapshot.create(BASE));
    const found = await repo.findByMentionId('kol-a:1:0');

    expect(found).not.toBeNull();
    expect(found?.kolId).toBe('kol-a');
    expect(await repo.count()).toBe(1);
  });

  it('unknown mentionId -> null', async () => {
    const repo = new InMemoryMentionSnapshotRepository();

    await expect(repo.findByMentionId('nobody:9:0')).resolves.toBeNull();
  });

  it('re-save same mentionId overwrites (double-delivery guard, P1)', async () => {
    const repo = new InMemoryMentionSnapshotRepository();

    await repo.save(MentionSnapshot.create(BASE));
    await repo.save(MentionSnapshot.create({ ...BASE, priceUsd: 9 }));

    expect(await repo.count()).toBe(1);
    expect((await repo.findByMentionId('kol-a:1:0'))?.priceUsd).toBe(9);
  });
});

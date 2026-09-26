import { NotFoundException } from '@nestjs/common';
import { SnapshotsController } from './snapshots.controller';

describe('SnapshotsController (P51 contract)', () => {
  function row(mentionId: string) {
    return {
      mentionId,
      marketCapUsd: 1000,
      priceUsd: 1.5,
      liquidityUsd: 500,
      holders: 10,
      symbol: 'T1',
    };
  }

  function repo(rows: Array<ReturnType<typeof row>>) {
    return {
      count: async () => rows.length,
      findPaged: async (limit: number, offset: number) =>
        rows.slice(offset, offset + limit),
      findByMentionId: async (id: string) =>
        rows.find((r) => r.mentionId === id) ?? null,
    };
  }

  it('lists paginated snapshots with total/limit/offset envelope', async () => {
    const controller = new SnapshotsController(
      repo([row('m1'), row('m2')]) as never,
    );
    const res = (await controller.list({ limit: 1, offset: 1 })) as {
      items: Array<Record<string, unknown>>;
      total: number;
      limit: number;
      offset: number;
    };
    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toEqual({
      mentionId: 'm2',
      marketCapUsd: 1000,
      priceUsd: 1.5,
      liquidityUsd: 500,
      holders: 10,
      symbol: 'T1',
    });
  });

  it('returns a single snapshot by mention id', async () => {
    const controller = new SnapshotsController(repo([row('m1')]) as never);
    await expect(controller.getByMentionId('m1')).resolves.toMatchObject({
      mentionId: 'm1',
    });
  });

  it('throws 404 on unknown snapshot (broken contract is loud)', async () => {
    const controller = new SnapshotsController(repo([]) as never);
    await expect(controller.getByMentionId('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});

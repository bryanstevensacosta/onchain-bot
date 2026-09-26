import { NotFoundException } from '@nestjs/common';
import { MentionsController } from './mentions.controller';

describe('MentionsController (P51 contract)', () => {
  function row(id: string) {
    return {
      id,
      kolId: 'k1',
      messageId: 7,
      contractIndex: 0,
      chain: 'solana',
      address: { value: 'A1' },
      ticker: 'T1',
    };
  }

  function repo(rows: Array<ReturnType<typeof row>>) {
    return {
      count: async () => rows.length,
      findPaged: async (limit: number, offset: number) =>
        rows.slice(offset, offset + limit),
      findById: async (id: string) => rows.find((r) => r.id === id) ?? null,
    };
  }

  it('lists paginated mentions with total/limit/offset envelope', async () => {
    const controller = new MentionsController(
      repo([row('a'), row('b')]) as never,
    );
    const res = (await controller.list({ limit: 1, offset: 1 })) as {
      items: Array<Record<string, unknown>>;
      total: number;
      limit: number;
      offset: number;
    };
    expect(res.total).toBe(2);
    expect(res.limit).toBe(1);
    expect(res.offset).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]['id']).toBe('b');
    expect(res.items[0]).toEqual({
      id: 'b',
      kolId: 'k1',
      messageId: 7,
      contractIndex: 0,
      chain: 'solana',
      address: 'A1',
      ticker: 'T1',
    });
  });

  it('returns a single mention by keyed id', async () => {
    const controller = new MentionsController(repo([row('a')]) as never);
    await expect(controller.getById('a')).resolves.toMatchObject({ id: 'a' });
  });

  it('throws 404 on unknown mention id (broken contract is loud)', async () => {
    const controller = new MentionsController(repo([]) as never);
    await expect(controller.getById('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});

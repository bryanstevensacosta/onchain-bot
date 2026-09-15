import { TypeOrmThreadsMatchingConfigRepository } from 'threads/integration/infrastructure/persistence/typeorm/repositories/typeorm-threads-matching-config.repository';
import type { ThreadsMatchingConfigEntity } from 'threads/integration/infrastructure/persistence/typeorm/entities/threads-matching-config.entity';
import { ThreadsMatchingConfig } from 'threads/integration/domain/entities/threads-matching-config.entity';

describe('TypeOrmThreadsMatchingConfigRepository', () => {
  it('seeds enabled=true on first boot when the row is missing', async () => {
    const saved: ThreadsMatchingConfigEntity[] = [];
    const fakeRepo = {
      findOne: async () => null,
      create: (row: ThreadsMatchingConfigEntity) => row,
      save: async (row: ThreadsMatchingConfigEntity) => {
        saved.push(row);
        return row;
      },
    };
    const repo = new TypeOrmThreadsMatchingConfigRepository(
      fakeRepo as unknown as never,
    );

    const config = await repo.load();

    expect(config.id).toBe(1);
    expect(config.enabled).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.enabled).toBe(true);
  });

  it('loads the persisted row without reseeding when present', async () => {
    const row = {
      id: 1,
      enabled: false,
      updatedAt: new Date('2026-09-15T10:00:00Z'),
    };
    const fakeRepo = {
      findOne: async () => row,
      create: jest.fn(),
      save: jest.fn(),
    };
    const repo = new TypeOrmThreadsMatchingConfigRepository(
      fakeRepo as unknown as never,
    );

    const config = await repo.load();

    expect(config.enabled).toBe(false);
    expect(fakeRepo.create).not.toHaveBeenCalled();
    expect(fakeRepo.save).not.toHaveBeenCalled();
  });

  it('save persists id/enabled/updatedAt', async () => {
    const persisted: unknown[] = [];
    const fakeRepo = {
      findOne: async () => null,
      create: (row: unknown) => row,
      save: async (row: unknown) => {
        persisted.push(row);
        return row;
      },
    };
    const repo = new TypeOrmThreadsMatchingConfigRepository(
      fakeRepo as unknown as never,
    );

    const config = ThreadsMatchingConfig.load({ id: 1, enabled: false });
    await repo.save(config);

    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ id: 1, enabled: false });
  });
});

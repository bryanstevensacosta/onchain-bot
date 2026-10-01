import { DataSource, QueryFailedError } from 'typeorm';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import { MessageTemplateDuplicateError } from '@/templates/infrastructure/persistence/message-template.errors';
import { MessageTemplateOrmEntity } from '@/templates/infrastructure/persistence/typeorm/message-template.orm-entity';
import { toMessageTemplateRow } from '@/templates/infrastructure/persistence/typeorm/mappers/message-template.mapper';
import { TypeOrmMessageTemplateRepository } from '@/templates/infrastructure/persistence/typeorm/repositories/typeorm-message-template.repository';

/**
 * TypeORM adapter spec WITHOUT a live DB (todo 3): the `DataSource` is
 * stubbed at the `getRepository` seam. Live-DB up/down proof runs via
 * `migration:run` + `migration:revert` in QA (evidence log).
 */
describe('typeorm message-template repository (stubbed datasource)', () => {
  const make = (name = 'full-dexter-v1', isActive = false): MessageTemplate =>
    MessageTemplate.create({
      command: 'ca',
      name,
      bodyMarkdown: '{{symbol}} body',
      isActive,
    });

  const stubDataSource = (rowsApi: Record<string, jest.Mock>) =>
    ({
      getRepository: jest.fn().mockReturnValue(rowsApi),
    }) as unknown as DataSource;

  const rowsReturning = (rows: MessageTemplateOrmEntity[]) => ({
    find: jest.fn().mockResolvedValue(rows),
    findOne: jest.fn().mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null,
    ),
    save: jest.fn().mockImplementation(async (row: MessageTemplateOrmEntity) => row),
    delete: jest
      .fn()
      .mockResolvedValue({ affected: 1, raw: undefined, generatedMaps: [] }),
  });

  it('findAll/findByCommand/findById/findActiveByCommand map rows to domain', async () => {
    const first = make('a', true);
    const second = make('b');
    const rows = [toMessageTemplateRow(first), toMessageTemplateRow(second)];
    const repo = new TypeOrmMessageTemplateRepository(
      stubDataSource(rowsReturning(rows)),
    );

    await expect(repo.findAll()).resolves.toHaveLength(2);
    await expect(repo.findByCommand('ca')).resolves.toHaveLength(2);
    await expect(repo.findByCommand('x')).resolves.toHaveLength(2);
    const byId = await repo.findById(first.id);
    expect(byId?.name).toBe('a');
    const active = await repo.findActiveByCommand('ca');
    expect(active?.id).toBe(first.id);
    await expect(repo.findById('missing')).resolves.toBeNull();
    await expect(repo.findActiveByCommand('z')).resolves.toBeNull();
  });

  it('save upserts and delete reports affected rows', async () => {
    const api = rowsReturning([]);
    const repo = new TypeOrmMessageTemplateRepository(stubDataSource(api));
    const saved = await repo.save(make());
    expect(saved.command).toBe('ca');
    expect(api.save).toHaveBeenCalledTimes(1);
    await expect(repo.delete(saved.id)).resolves.toBe(true);
  });

  it('unique violation (23505, incl. driverError-only shape) maps to a domain error', async () => {
    const direct = new QueryFailedError(
      'INSERT ...',
      undefined,
      { code: '23505' } as unknown as Error,
    );
    // QueryFailedError flattens driver props onto itself; simulate a driver
    // that only exposes the code via `.driverError` (fallback branch).
    const viaDriverOnly = new QueryFailedError(
      'INSERT ...',
      undefined,
      { code: '23505', detail: 'x' } as unknown as Error,
    );
    delete (viaDriverOnly as { code?: unknown }).code;
    for (const failure of [direct, viaDriverOnly]) {
      const api = rowsReturning([]);
      api.save = jest.fn().mockRejectedValue(failure);
      const repo = new TypeOrmMessageTemplateRepository(stubDataSource(api));
      await expect(repo.save(make())).rejects.toBeInstanceOf(
        MessageTemplateDuplicateError,
      );
      await expect(repo.save(make())).rejects.toMatchObject({
        code: 'MESSAGE_TEMPLATE_DUPLICATE',
      });
    }
  });

  it('non-unique failures rethrow raw (never swallowed)', async () => {
    const api = rowsReturning([]);
    api.save = jest.fn().mockRejectedValue(new Error('connection lost'));
    const repo = new TypeOrmMessageTemplateRepository(stubDataSource(api));
    await expect(repo.save(make())).rejects.toThrow('connection lost');
  });
});

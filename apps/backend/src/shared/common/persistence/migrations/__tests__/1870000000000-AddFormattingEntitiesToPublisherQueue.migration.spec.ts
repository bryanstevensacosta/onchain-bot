import type { QueryRunner } from 'typeorm';
import { AddFormattingEntitiesToPublisherQueue1870000000000 } from '../1870000000000-AddFormattingEntitiesToPublisherQueue';

describe('AddFormattingEntitiesToPublisherQueue1870000000000 migration', () => {
  const migration = new AddFormattingEntitiesToPublisherQueue1870000000000();

  function createQueryRunner(): {
    runner: QueryRunner;
    query: jest.Mock;
  } {
    const query = jest.fn();
    return { runner: { query } as unknown as QueryRunner, query };
  }

  it('up() adds the formatting_entities column idempotently', async () => {
    const { runner, query } = createQueryRunner();

    await migration.up(runner);

    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain(
      'ADD COLUMN IF NOT EXISTS "formatting_entities"',
    );
  });

  it('down() drops the formatting_entities column', async () => {
    const { runner, query } = createQueryRunner();

    await migration.down(runner);

    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain(
      'DROP COLUMN IF EXISTS "formatting_entities"',
    );
  });
});

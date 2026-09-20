import type { QueryRunner } from 'typeorm';
import { DropLlmConfigMatchingEnabled1875000000002 } from '../1875000000002-DropLlmConfigMatchingEnabled';

describe('DropLlmConfigMatchingEnabled1875000000002 migration', () => {
  const migration = new DropLlmConfigMatchingEnabled1875000000002();

  function createQueryRunner(): { runner: QueryRunner; query: jest.Mock } {
    const query = jest.fn().mockResolvedValue([]);
    return { runner: { query } as unknown as QueryRunner, query };
  }

  it('up() drops the deprecated matching_enabled column (idempotent)', async () => {
    const { runner, query } = createQueryRunner();

    await migration.up(runner);

    expect(query).toHaveBeenCalledTimes(1);
    const ddl = String(query.mock.calls[0]?.[0]);
    expect(ddl).toContain('crypto_news_publisher_llm_config');
    expect(ddl).toContain('DROP COLUMN IF EXISTS "matching_enabled"');
  });

  it('down() re-adds the column shape only (default false, no value restore)', async () => {
    const { runner, query } = createQueryRunner();

    await migration.down(runner);

    expect(query).toHaveBeenCalledTimes(1);
    const ddl = String(query.mock.calls[0]?.[0]);
    expect(ddl).toContain('crypto_news_publisher_llm_config');
    expect(ddl).toContain('ADD COLUMN IF NOT EXISTS "matching_enabled"');
    expect(ddl).toContain('DEFAULT false');
  });
});

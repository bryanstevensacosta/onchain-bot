import type { QueryRunner } from 'typeorm';
import { BackfillMatchingConfigFromLlm1875000000000 } from '../1875000000000-BackfillMatchingConfigFromLlm';

describe('BackfillMatchingConfigFromLlm1875000000000 migration', () => {
  const migration = new BackfillMatchingConfigFromLlm1875000000000();

  function createQueryRunner(columnExists: boolean): {
    runner: QueryRunner;
    query: jest.Mock;
  } {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (String(sql).includes('information_schema.columns')) {
        return Promise.resolve(columnExists ? [{ column_name: 'x' }] : []);
      }
      return Promise.resolve([]);
    });
    return { runner: { query } as unknown as QueryRunner, query };
  }

  it('up() ensures the matching row then backfills true where llm matching was true', async () => {
    const { runner, query } = createQueryRunner(true);

    await migration.up(runner);

    const ddls = query.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(ddls[0]).toContain('CREATE TABLE IF NOT EXISTS');
    expect(ddls[0]).toContain('crypto_news_matching_config');
    expect(ddls[1]).toContain('INSERT INTO "crypto_news_matching_config"');
    expect(ddls[1]).toContain('ON CONFLICT ("id") DO NOTHING');
    expect(ddls.some((d) => d.includes('information_schema.columns'))).toBe(
      true,
    );
    const backfill = ddls.find((d) => d.startsWith('UPDATE'));
    expect(backfill).toContain('crypto_news_matching_config');
    expect(backfill).toContain('crypto_news_publisher_llm_config');
    expect(backfill).toContain('"matching_enabled" = true');
  });

  it('up() skips the backfill UPDATE when the llm column is gone (synchronize-era DB)', async () => {
    const { runner, query } = createQueryRunner(false);

    await migration.up(runner);

    const ddls = query.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(ddls.some((d) => d.startsWith('UPDATE'))).toBe(false);
  });

  it('down() resets matching id=1 to false', async () => {
    const { runner, query } = createQueryRunner(true);

    await migration.down(runner);

    expect(query).toHaveBeenCalledTimes(1);
    const ddl = String(query.mock.calls[0]?.[0]);
    expect(ddl).toContain('crypto_news_matching_config');
    expect(ddl).toContain('"enabled" = false');
  });
});

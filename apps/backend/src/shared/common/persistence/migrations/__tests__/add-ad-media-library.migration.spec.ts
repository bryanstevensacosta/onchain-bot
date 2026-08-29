import type { QueryRunner } from 'typeorm';
import { AddAdMediaLibrary1830000000000 } from '../1830000000000-add-ad-media-library';

describe('AddAdMediaLibrary1830000000000 migration', () => {
  const migration = new AddAdMediaLibrary1830000000000();

  function createQueryRunner(): {
    runner: QueryRunner;
    query: jest.Mock;
  } {
    const query = jest.fn();
    return { runner: { query } as unknown as QueryRunner, query };
  }

  it('up() creates crypto_news_ad_media_library with the full column set', async () => {
    const { runner, query } = createQueryRunner();

    await migration.up(runner);

    expect(query).toHaveBeenCalledTimes(1);
    const ddl = String((query.mock.calls[0] as any[])[0]);
    expect(ddl).toContain('crypto_news_ad_media_library');
    expect(ddl).toContain('content_hash');
    expect(ddl).toContain('file_path');
    expect(ddl).toContain('original_file_name');
    expect(ddl).toContain('mime_type');
    expect(ddl).toContain('file_size');
    expect(ddl).toContain('created_at');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS');
  });

  it('down() drops crypto_news_ad_media_library', async () => {
    const { runner, query } = createQueryRunner();

    await migration.down(runner);

    expect(query).toHaveBeenCalledTimes(1);
    const ddl = String((query.mock.calls[0] as any[])[0]);
    expect(ddl).toContain('crypto_news_ad_media_library');
    expect(ddl).toContain('DROP TABLE IF EXISTS');
  });
});

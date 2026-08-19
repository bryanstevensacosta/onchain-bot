import { MigrationInterface, QueryRunner } from 'typeorm';

export class LlmConfigRejectNonLatin1790000000000 implements MigrationInterface {
  name = 'LlmConfigRejectNonLatin1790000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE crypto_news_publisher_llm_config ADD COLUMN IF NOT EXISTS reject_non_latin boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE crypto_news_publisher_llm_config DROP COLUMN IF EXISTS reject_non_latin`,
    );
  }
}

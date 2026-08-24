import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropChainDexterChatTables1850000000000 implements MigrationInterface {
  public name = 'DropChainDexterChatTables1850000000000';

  public async up(qr: QueryRunner): Promise<void> {
    // Drop chat_settings first (has FK to chat_groups via chat_group_id)
    await qr.query(`DROP TABLE IF EXISTS chain_dexter_chat_settings`);
    // Then drop chat_groups
    await qr.query(`DROP TABLE IF EXISTS chain_dexter_chat_groups`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Re-create chain_dexter_chat_groups
    await qr.query(
      `CREATE TABLE chain_dexter_chat_groups (` +
        `id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ` +
        `telegram_chat_id bigint NOT NULL, ` +
        `telegram_chat_type varchar(32) NOT NULL, ` +
        `title varchar(255) NULL, ` +
        `telegram_chat_username varchar(64) NULL, ` +
        `created_at timestamptz NOT NULL DEFAULT now(), ` +
        `last_seen_at timestamptz NOT NULL DEFAULT now() ` +
        `)`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_chain_dexter_chat_groups_chat_id ON chain_dexter_chat_groups (telegram_chat_id)`,
    );

    // Re-create chain_dexter_chat_settings
    await qr.query(
      `CREATE TABLE chain_dexter_chat_settings (` +
        `id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ` +
        `chat_group_id uuid NOT NULL, ` +
        `enabled_trade_buttons text[] NOT NULL DEFAULT ARRAY['DEX','PHO','TRO'], ` +
        `trade_buttons_position varchar(8) NOT NULL DEFAULT 'bot', ` +
        `trade_buttons_limit integer NOT NULL DEFAULT 3, ` +
        `emoji_mode boolean NOT NULL DEFAULT true, ` +
        `group_mode boolean NOT NULL DEFAULT true, ` +
        `auto_responder boolean NOT NULL DEFAULT true, ` +
        `price_mode varchar(3) NOT NULL DEFAULT 'adv', ` +
        `updated_at timestamptz NOT NULL DEFAULT now() ` +
        `)`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_chain_dexter_chat_settings_chat_group_id ON chain_dexter_chat_settings (chat_group_id)`,
    );
  }
}

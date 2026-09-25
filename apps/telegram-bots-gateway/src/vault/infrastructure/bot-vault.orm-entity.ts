import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * `bot_vault` table (own logical DB `onchain_bot_bots[_staging]`).
 * Token stored ONLY as AES-256-GCM ciphertext — never plaintext.
 */
@Entity('bot_vault')
export class BotVaultOrmEntity {
  @PrimaryColumn('varchar')
  public id!: string;

  @Column('varchar')
  public label!: string;

  @Column('text', { name: 'token' })
  public encryptedToken!: string;

  @Column('varchar', { name: 'owner_app' })
  public ownerApp!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @Column('timestamptz', { name: 'rotated_at', nullable: true })
  public rotatedAt!: Date | null;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel';

@Entity('chain_dexter_chat_groups')
@Index('uq_chain_dexter_chat_groups_chat_id', ['telegramChatId'], {
  unique: true,
})
export class ChatGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('bigint', { name: 'telegram_chat_id' })
  telegramChatId!: string;

  @Column('varchar', { name: 'telegram_chat_type', length: 32 })
  telegramChatType!: TelegramChatType;

  @Column('varchar', { length: 255, nullable: true })
  title!: string | null;

  @Column('varchar', {
    name: 'telegram_chat_username',
    length: 64,
    nullable: true,
  })
  telegramChatUsername!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'last_seen_at' })
  lastSeenAt!: Date;
}

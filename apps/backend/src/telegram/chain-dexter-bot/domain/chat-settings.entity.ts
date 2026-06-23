import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('chain_dexter_chat_settings')
@Index('uq_chain_dexter_chat_settings_chat_group_id', ['chatGroupId'], {
  unique: true,
})
export class ChatSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'chat_group_id' })
  chatGroupId!: string;

  @Column('simple-array', {
    name: 'enabled_trade_buttons',
    default: 'DEX,PHO,TRO',
  })
  enabledTradeButtons!: string[];

  @Column('varchar', {
    name: 'trade_buttons_position',
    length: 8,
    default: 'bot',
  })
  tradeButtonsPosition!: 'top' | 'bot';

  @Column('int', { name: 'trade_buttons_limit', default: 3 })
  tradeButtonsLimit!: number;

  @Column('boolean', { name: 'emoji_mode', default: true })
  emojiMode!: boolean;

  @Column('boolean', { name: 'group_mode', default: true })
  groupMode!: boolean;

  @Column('boolean', { name: 'auto_responder', default: true })
  autoResponder!: boolean;

  @Column('varchar', { name: 'price_mode', length: 3, default: 'adv' })
  priceMode!: 'sim' | 'adv';

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

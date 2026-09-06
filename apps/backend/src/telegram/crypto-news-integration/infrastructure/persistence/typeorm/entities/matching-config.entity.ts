import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('crypto_news_matching_config')
export class MatchingConfigEntity {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}

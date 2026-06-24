import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'scoring_thresholds' })
@Index('idx_scoring_thresholds_scope', ['scope'])
export class ScoringThresholdEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({
    name: 'scope',
    type: 'enum',
    enum: ['token', 'kol'],
  })
  public scope!: 'token' | 'kol';

  @Column({ name: 'min_score', type: 'integer' })
  public minScore!: number;

  @Column({ name: 'max_score', type: 'integer' })
  public maxScore!: number;

  @Column({ name: 'decision', type: 'varchar', length: 32 })
  public decision!: string;
}

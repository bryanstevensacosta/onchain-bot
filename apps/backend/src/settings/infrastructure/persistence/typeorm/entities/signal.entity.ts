import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'signals' })
@Index('uq_signals_code', ['code'], { unique: true })
@Index('idx_signals_applies_to', ['appliesTo'])
export class SignalEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ name: 'code', type: 'varchar', length: 100 })
  public code!: string;

  @Column({ name: 'name', type: 'varchar', length: 200 })
  public name!: string;

  @Column({ name: 'penalty', type: 'integer' })
  public penalty!: number;

  @Column({
    name: 'risk_level',
    type: 'enum',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  })
  public riskLevel!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @Column({ name: 'enabled', type: 'boolean', default: true })
  public enabled!: boolean;

  @Column({
    name: 'applies_to',
    type: 'enum',
    enum: ['token', 'kol'],
  })
  public appliesTo!: 'token' | 'kol';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}

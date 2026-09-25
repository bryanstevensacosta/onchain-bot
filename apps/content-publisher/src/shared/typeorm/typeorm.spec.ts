import { Entity, PrimaryGeneratedColumn } from 'typeorm';
import { SnakeCaseNamingStrategy } from './naming-strategy';
import { TypeOrmBase } from './base.entity';

@Entity()
class ProbeEntity extends TypeOrmBase {
  @PrimaryGeneratedColumn('uuid')
  public override id!: string;

  public createdBySuite!: string;
}

describe('typeorm base', () => {
  it('naming strategy snake_cases tables and columns', () => {
    const strategy = new SnakeCaseNamingStrategy();
    expect(strategy.tableName('ProbeEntity', undefined)).toBe('probe_entity');
    expect(strategy.columnName('createdAt', undefined, [])).toBe('created_at');
    expect(strategy.columnName('id', 'custom_id', [])).toBe('custom_id');
  });

  it('probe entity extends the base', () => {
    expect(new ProbeEntity()).toBeInstanceOf(TypeOrmBase);
  });
});

import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TypeOrmBase entity (Tramo 2, todo 1).
 *
 * Mirrors the backend persistence convention: uuid PK + created/updated
 * timestamps. Feature entities extend this (their tables land with
 * the persistence todos, not here).
 */
export abstract class TypeOrmBase {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}

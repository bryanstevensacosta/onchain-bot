import { Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { EmojiMap } from '@/templates/domain/emoji-map.entity';
import { EmojiMapDuplicateError } from '@/templates/domain/emoji-map.validators';
import { EmojiMapRepository } from '@/templates/domain/ports/emoji-map.repository';
import { EmojiMapOrmEntity } from '../emoji-map.orm-entity';
import { toEmojiMapDomain, toEmojiMapRow } from '../mappers/emoji-map.mapper';

/**
 * TypeORM `EmojiMapRepository` (todo 5). Live binding when
 * `DATABASE_ENABLED=true` (wired in todo 13). Unique violations on
 * `(placeholderKey, matchValue)` surface as `EmojiMapDuplicateError`
 * (domain error, never a raw 500).
 */
@Injectable()
export class TypeOrmEmojiMapRepository extends EmojiMapRepository {
  public constructor(private readonly dataSource: DataSource) {
    super();
  }

  private rows(): Repository<EmojiMapOrmEntity> {
    return this.dataSource.getRepository(EmojiMapOrmEntity);
  }

  public async findAll(): Promise<readonly EmojiMap[]> {
    const rows = await this.rows().find({
      order: { placeholderKey: 'ASC', matchValue: 'ASC' },
    });
    return rows.map(toEmojiMapDomain);
  }

  public async findByKey(placeholderKey: string): Promise<readonly EmojiMap[]> {
    const rows = await this.rows().find({
      where: { placeholderKey: placeholderKey.trim() },
      order: { matchValue: 'ASC' },
    });
    return rows.map(toEmojiMapDomain);
  }

  public async findOne(id: string): Promise<EmojiMap | null> {
    const row = await this.rows().findOne({ where: { id } });
    return row ? toEmojiMapDomain(row) : null;
  }

  public async save(map: EmojiMap): Promise<EmojiMap> {
    try {
      const saved = await this.rows().save(toEmojiMapRow(map));
      return toEmojiMapDomain(saved);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new EmojiMapDuplicateError(
          `EmojiMap (${map.placeholderKey}, ${map.matchValue}) already exists`,
          { placeholderKey: map.placeholderKey, matchValue: map.matchValue },
        );
      }
      throw error;
    }
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.rows().delete(id);
    return (result.affected ?? 0) > 0;
  }
}

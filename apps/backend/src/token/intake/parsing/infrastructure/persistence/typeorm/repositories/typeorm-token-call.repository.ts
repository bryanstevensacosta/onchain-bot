import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenCall } from 'token/intake/parsing/domain/entities/token-call.entity';
import { TokenCallRepository } from 'token/intake/parsing/application/ports/token-call.repository';
import { TokenCallEntity } from 'token/intake/parsing/infrastructure/persistence/typeorm/entities/token-call.entity';
import { TokenCallMapper } from 'token/intake/parsing/infrastructure/persistence/typeorm/mappers/token-call.mapper';

@Injectable()
export class TypeOrmTokenCallRepository extends TokenCallRepository {
  public constructor(
    @InjectRepository(TokenCallEntity)
    private readonly repo: Repository<TokenCallEntity>,
  ) {
    super();
  }

  public async save(call: TokenCall): Promise<void> {
    await this.repo.save(TokenCallMapper.toRow(call));
  }

  public async findByChannelAndMessage(
    kolId: string,
    messageId: number,
  ): Promise<TokenCall | null> {
    const id = `${kolId}:${messageId}`;
    const row = await this.repo.findOne({
      where: { id, kolId, messageId: String(messageId) },
    });
    return row ? TokenCallMapper.toDomain(row) : null;
  }

  public async findRecent(limit: number): Promise<ReadonlyArray<TokenCall>> {
    const rows = await this.repo.find({
      order: { occurredAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => TokenCallMapper.toDomain(r));
  }
}

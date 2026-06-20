import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { TokenSnapshotRepository } from 'discovery/enrichment/application/ports/token-snapshot.repository';
import {
  TokenSnapshotMapper,
  TokenSnapshotView,
} from 'discovery/enrichment/application/mappers/token-snapshot.mapper';

@Injectable()
export class ListSnapshotsUseCase {
  public constructor(private readonly snapshotRepo: TokenSnapshotRepository) {}

  public async execute(
    limit: number,
  ): Promise<ReadonlyArray<TokenSnapshotView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid limit: ${limit}`, {
        limit,
      });
    }
    const snapshots = await this.snapshotRepo.findRecent(limit);
    return snapshots.map((s) => TokenSnapshotMapper.toView(s));
  }
}

import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { HoneypotAnalysisRepository } from 'ca/honeypot/application/ports/honeypot-analysis.repository';
import {
  HoneypotAnalysisView,
  HoneypotAnalysisMapper,
} from 'ca/honeypot/application/mappers/honeypot-analysis.mapper';

@Injectable()
export class ListHoneypotAnalysesUseCase {
  public constructor(private readonly repo: HoneypotAnalysisRepository) {}

  public async execute(
    limit: number,
  ): Promise<ReadonlyArray<HoneypotAnalysisView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid limit: ${limit}`, {
        limit,
      });
    }
    const items = await this.repo.findRecent(limit);
    return items.map((a) => HoneypotAnalysisMapper.toView(a));
  }
}

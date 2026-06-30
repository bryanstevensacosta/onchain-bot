import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MonitoredCallRecord,
  MonitoredCallRepository,
} from '../ports/monitored-call.repository';
import { TokenSnapshotRepository } from 'token/enrichment/application/ports/token-snapshot.repository';

export interface RegisterMonitoredCallInput {
  callId: string;
  chain: string;
  address: string;
  publishedAt: Date;
  /**
   * Optional fallback for mcAtCall. Used when no enrichment snapshot exists
   * or the snapshot has no marketCapUsd.
   */
  mcAtCall?: number;
}

@Injectable()
export class RegisterMonitoredCallUseCase {
  constructor(
    private readonly repo: MonitoredCallRepository,
    private readonly snapshotRepo: TokenSnapshotRepository,
  ) {}

  async execute(
    input: RegisterMonitoredCallInput,
  ): Promise<MonitoredCallRecord> {
    const existing = await this.repo.findByCallId(input.callId);
    if (existing) {
      return existing;
    }

    // Look up the enrichment snapshot to get mcAtCall baseline
    const chain = ChainId.fromString(input.chain);
    const snapshot = await this.snapshotRepo.findByChainAndAddress(
      chain,
      input.address,
    );

    let mcAtCall: number;
    if (snapshot?.marketCapUsd != null) {
      mcAtCall = snapshot.marketCapUsd;
    } else if (input.mcAtCall != null) {
      mcAtCall = input.mcAtCall;
    } else {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'mcAtCall is required (no snapshot found and no fallback provided)',
      );
    }

    return this.repo.save({
      callId: input.callId,
      chain: input.chain,
      address: input.address,
      mcAtCall,
      publishedAt: input.publishedAt,
      lastEvaluatedAt: null,
    });
  }
}

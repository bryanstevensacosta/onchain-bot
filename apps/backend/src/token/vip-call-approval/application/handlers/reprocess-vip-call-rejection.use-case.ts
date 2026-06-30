import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { EnrichTokenUseCase } from 'token/enrichment/application/handlers/enrich-token.use-case';
import { TokenSnapshotRepository } from 'token/enrichment/application/ports/token-snapshot.repository';
import { VipCallApprovalDecisionRepository } from 'token/vip-call-approval/application/ports/vip-call-approval-decision.repository';
import {
  VipCallApprovalDecisionView,
  VipCallApprovalDecisionMapper,
} from 'token/vip-call-approval/application/mappers/vip-call-approval-decision.mapper';
import { TokenSnapshotView } from 'token/enrichment/application/mappers/token-snapshot.mapper';

export type ReprocessStatus =
  | 'REPROCESSED'
  | 'ENRICHMENT_FAILED'
  | 'NOT_FOUND'
  | 'ERROR';

export interface ReprocessResultView {
  readonly status: ReprocessStatus;
  readonly chain: string;
  readonly address: string;
  readonly previousVerdict?: string;
  readonly decision?: VipCallApprovalDecisionView;
  readonly snapshot?: TokenSnapshotView;
  readonly error?: string;
}

const POLL_INTERVAL_MS = 100;
const MAX_WAIT_MS = 5000;

@Injectable()
export class ReprocessVipCallRejectionUseCase {
  private readonly logger = new Logger(ReprocessVipCallRejectionUseCase.name);

  public constructor(
    private readonly enrich: EnrichTokenUseCase,
    private readonly decisionRepo: VipCallApprovalDecisionRepository,
    private readonly snapshotRepo: TokenSnapshotRepository,
  ) {}

  public async execute(input: {
    chain: string;
    address: string;
  }): Promise<ReprocessResultView> {
    const chain = ChainId.fromString(input.chain);
    const normalizedAddress = chain.isSolana
      ? input.address
      : input.address.toLowerCase();

    const previous = await this.decisionRepo.findByChainAndAddress(
      chain,
      normalizedAddress,
    );
    if (!previous) {
      return {
        status: 'NOT_FOUND',
        chain: chain.value,
        address: normalizedAddress,
        error: 'No filter decision found for this token',
      };
    }

    const previousDecidedAt = previous.decidedAt;
    const previousVerdict = previous.verdict.value;

    let enrichResult: Awaited<ReturnType<EnrichTokenUseCase['execute']>>;
    try {
      enrichResult = await this.enrich.execute({
        chain: chain.value,
        address: normalizedAddress,
        force: true,
      });
    } catch (err) {
      this.logger.error(
        `Enrichment threw for ${chain.value}:${normalizedAddress}: ${(err as Error).message}`,
      );
      return {
        status: 'ERROR',
        chain: chain.value,
        address: normalizedAddress,
        previousVerdict,
        error: (err as Error).message,
      };
    }

    const snapshotView = enrichResult.snapshot;
    const snapshotHasData =
      enrichResult.errors.length === 0
        ? snapshotView.completeness > 0
        : snapshotView.completeness > 0;

    if (!snapshotHasData) {
      return {
        status: 'ENRICHMENT_FAILED',
        chain: chain.value,
        address: normalizedAddress,
        previousVerdict,
        snapshot: snapshotView,
        error: 'All enrichment providers failed or returned no data',
      };
    }

    const newDecision = await this.waitForUpdatedDecision(
      chain,
      normalizedAddress,
      previousDecidedAt,
    );

    if (!newDecision) {
      return {
        status: 'ERROR',
        chain: chain.value,
        address: normalizedAddress,
        previousVerdict,
        snapshot: snapshotView,
        error: `Filter decision was not updated within ${MAX_WAIT_MS}ms after re-enrichment`,
      };
    }

    return {
      status: 'REPROCESSED',
      chain: chain.value,
      address: normalizedAddress,
      previousVerdict,
      decision: VipCallApprovalDecisionMapper.toView(newDecision),
      snapshot: snapshotView,
    };
  }

  private async waitForUpdatedDecision(
    chain: ChainId,
    address: string,
    previousDecidedAt: Date,
  ): Promise<
    Awaited<ReturnType<VipCallApprovalDecisionRepository['findByChainAndAddress']>>
  > {
    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      const decision = await this.decisionRepo.findByChainAndAddress(
        chain,
        address,
      );
      if (
        decision &&
        decision.decidedAt.getTime() > previousDecidedAt.getTime()
      ) {
        return decision;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    return null;
  }
}

import { Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { TokenSnapshotRepository } from 'token/enrichment/application/ports/token-snapshot.repository';
import { FilterDecisionRepository } from 'token/token-gating/application/ports/filter-decision.repository';
import { FilterReason } from 'token/token-gating/domain/value-objects/filter-reason.vo';

export type ReprocessRecommendation =
  | 'REPROCESS'
  | 'SKIP'
  | 'NEEDS_BLACKLIST_REVIEW'
  | 'NEEDS_CHAIN_SUPPORT';

export interface RejectedTokenDiagnostics {
  readonly chain: string;
  readonly address: string;
  readonly currentVerdict: string;
  readonly score: number;
  readonly classification: string;
  readonly reasons: ReadonlyArray<{ code: string; message: string }>;
  readonly snapshotCompleteness: number | null;
  readonly providerErrors: ReadonlyArray<{ provider: string; message: string }>;
  readonly retryable: boolean;
  readonly retryableReasons: ReadonlyArray<{ code: string; message: string }>;
  readonly blockedReasons: ReadonlyArray<{ code: string; message: string }>;
  readonly recommended: ReprocessRecommendation;
  readonly decidedAt: string;
}

@Injectable()
export class VerifyRejectedTokenUseCase {
  public constructor(
    private readonly decisionRepo: FilterDecisionRepository,
    private readonly snapshotRepo: TokenSnapshotRepository,
  ) {}

  public async execute(input: {
    chain: string;
    address: string;
  }): Promise<RejectedTokenDiagnostics> {
    const chain = ChainId.fromString(input.chain);
    const normalizedAddress = chain.isSolana
      ? input.address
      : input.address.toLowerCase();

    const [decision, snapshot] = await Promise.all([
      this.decisionRepo.findByChainAndAddress(chain, normalizedAddress),
      this.snapshotRepo.findByChainAndAddress(chain, normalizedAddress),
    ]);

    if (!decision) {
      return {
        chain: chain.value,
        address: normalizedAddress,
        currentVerdict: 'NONE',
        score: 0,
        classification: 'UNKNOWN',
        reasons: [],
        snapshotCompleteness: snapshot?.snapshotCompleteness ?? null,
        providerErrors:
          snapshot?.providerErrors.map((e) => ({
            provider: e.provider,
            message: e.message,
          })) ?? [],
        retryable: false,
        retryableReasons: [],
        blockedReasons: [],
        recommended: 'SKIP',
        decidedAt: new Date(0).toISOString(),
      };
    }

    const reasons = decision.reasons.map((r) => ({
      code: r.code,
      message: r.message,
    }));

    const retryableReasons = reasons.filter((r) =>
      FilterReason.isRetryable(r.code),
    );
    const blockedReasons = reasons.filter(
      (r) => !FilterReason.isRetryable(r.code),
    );

    const hasBlacklist = reasons.some((r) => r.code === 'BLACKLISTED');
    const hasChainUnsupported = reasons.some(
      (r) => r.code === 'CHAIN_UNSUPPORTED',
    );

    let recommended: ReprocessRecommendation;
    if (hasBlacklist) {
      recommended = 'NEEDS_BLACKLIST_REVIEW';
    } else if (hasChainUnsupported) {
      recommended = 'NEEDS_CHAIN_SUPPORT';
    } else if (retryableReasons.length > 0) {
      recommended = 'REPROCESS';
    } else {
      recommended = 'SKIP';
    }

    return {
      chain: chain.value,
      address: normalizedAddress,
      currentVerdict: decision.verdict.value,
      score: decision.score,
      classification: decision.classification,
      reasons,
      snapshotCompleteness: snapshot?.snapshotCompleteness ?? null,
      providerErrors:
        snapshot?.providerErrors.map((e) => ({
          provider: e.provider,
          message: e.message,
        })) ?? [],
      retryable: retryableReasons.length > 0,
      retryableReasons,
      blockedReasons,
      recommended,
      decidedAt: decision.decidedAt.toISOString(),
    };
  }
}

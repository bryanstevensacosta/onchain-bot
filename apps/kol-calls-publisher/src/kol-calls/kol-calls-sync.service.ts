import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ScoreTokenUseCase } from '../scoring/application/handlers/score-token.use-case';
import { ScoredCallRepository } from '../scoring/application/ports/scored-call.repository';
import { KolCallsClient } from './kol-calls.client';

/**
 * KolCallsSyncService — pulls mentions + enriched snapshots from upstream
 * kol-calls over the P51 HTTP contract and scores them locally (P51).
 *
 * Each tick pages recent mentions + snapshots (KOL_CALLS_SYNC_LIMIT,
 * default 50), joins them by mention id, maps onto ScoreMentionInput,
 * and delegates to the UNCHANGED ScoreTokenUseCase (scoring math
 * identical pre/post split — no behavior change). Upstream failures
 * degrade to a skipped tick (never throws out of the cron).
 * Runs on a cron (KOL_CALLS_SYNC_ENABLED=true, default every minute);
 * each tick pages recent snapshots (KOL_CALLS_SYNC_LIMIT, default 50),
 * maps snapshot fields onto ScoreMentionInput, and delegates to the
 * UNCHANGED ScoreTokenUseCase (scoring math identical pre/post split —
 * no behavior change). Upstream failures degrade to a skipped tick
 * (warn, never throw out of the cron).
 */
@Injectable()
export class KolCallsSyncService {
  public constructor(
    private readonly client: KolCallsClient,
    private readonly scorer: ScoreTokenUseCase,
    private readonly scored: ScoredCallRepository,
  ) {}

  @Cron('*/1 * * * *')
  public async tick(): Promise<{ scored: number; skipped: boolean }> {
    if ((process.env.KOL_CALLS_SYNC_ENABLED ?? 'false') !== 'true') {
      return { scored: 0, skipped: true };
    }
    return this.syncOnce();
  }

  public async syncOnce(): Promise<{ scored: number; skipped: boolean }> {
    const limit = Number(process.env.KOL_CALLS_SYNC_LIMIT ?? 50);
    let mentionsPage;
    let snapshotsPage;
    try {
      [mentionsPage, snapshotsPage] = await Promise.all([
        this.client.listMentions(limit, 0),
        this.client.listSnapshots(limit, 0),
      ]);
    } catch {
      return { scored: 0, skipped: true };
    }
    const snapshotsById = new Map(
      snapshotsPage.items.map((snap) => [snap.mentionId, snap]),
    );
    const inputs = mentionsPage.items.map((mention) => {
      const snap = snapshotsById.get(mention.id);
      return {
        mentionId: mention.id,
        kolId: mention.kolId,
        messageId: mention.messageId,
        contractIndex: mention.contractIndex,
        chain: mention.chain,
        address: mention.address,
        priceUsd: snap?.priceUsd ?? null,
        liquidityUsd: snap?.liquidityUsd ?? null,
        marketCapUsd: snap?.marketCapUsd ?? null,
        holders: snap?.holders ?? null,
      };
    });
    if (inputs.length === 0) {
      return { scored: 0, skipped: true };
    }
    const { scored } = await this.scorer.execute({ mentions: inputs });
    for (const row of scored) {
      await this.scored.save(row);
    }
    return { scored: scored.length, skipped: false };
  }
}

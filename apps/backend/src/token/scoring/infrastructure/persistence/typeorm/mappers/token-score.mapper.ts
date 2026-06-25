import {
  TokenScore,
  ScoreBreakdownItem,
} from 'token/scoring/domain/entities/token-score.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { Score } from 'token/scoring/domain/value-objects/score.vo';
import { ScoreTier } from 'token/scoring/domain/value-objects/score-tier.vo';
import { TokenScoreEntity } from 'token/scoring/infrastructure/persistence/typeorm/entities/token-score.entity';

/**
 * Maps between `TokenScore` domain aggregate and the TypeORM row.
 *
 * `TokenScore.tier` is a `ScoreTier` VO (N15). The DB stores the string
 * value (`STRONG`/`DECENT`/`NEUTRAL`/`RISKY`/`AVOID`) — semantic loss is
 * acceptable because the consumer rehydrates only when needed; for
 * queries we filter by `tier` column directly.
 *
 * N17: `breakdown` is now persisted as JSONB column.
 */
export class TokenScoreMapper {
  public static toRow(score: TokenScore): TokenScoreEntity {
    const row = new TokenScoreEntity();
    row.id = score.id;
    row.chain = score.chain.value;
    row.address = score.address;
    row.score = score.score.value;
    row.tier = score.tier.value;
    row.classification = score.classification;
    row.sourceCount = score.sourceCount;
    row.mentionCount = score.mentionCount;
    row.avgKolReputation = score.avgKolReputation;
    row.scoredAt = score.scoredAt;
    row.breakdown = score.breakdown.length > 0 ? [...score.breakdown] : null;
    return row;
  }

  public static toDomain(row: TokenScoreEntity): TokenScore {
    return TokenScore.rehydrate({
      id: row.id,
      chain: ChainId.fromString(row.chain),
      address: row.address,
      score: Score.fromNumber(row.score),
      tier: ScoreTier.fromString(row.tier),
      classification: row.classification,
      sourceCount: row.sourceCount,
      mentionCount: row.mentionCount,
      avgKolReputation: row.avgKolReputation,
      scoredAt: row.scoredAt,
      breakdown: row.breakdown ?? ([] as readonly ScoreBreakdownItem[]),
    });
  }
}

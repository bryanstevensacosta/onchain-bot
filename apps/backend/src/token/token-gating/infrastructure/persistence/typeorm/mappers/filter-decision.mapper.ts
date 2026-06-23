import { FilterDecision } from 'token/token-gating/domain/entities/filter-decision.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { FilterVerdict } from 'token/token-gating/domain/value-objects/filter-verdict.vo';
import { FilterReason } from 'token/token-gating/domain/value-objects/filter-reason.vo';
import { FilterDecisionEntity } from 'token/token-gating/infrastructure/persistence/typeorm/entities/filter-decision.entity';

export class FilterDecisionMapper {
  public static toRow(d: FilterDecision): FilterDecisionEntity {
    const row = new FilterDecisionEntity();
    row.id = d.id;
    row.chain = d.chain.value;
    row.address = d.address;
    row.verdict = d.verdict.value;
    row.score = d.score;
    row.classification = d.classification;
    row.reasons = d.reasons.map((r) => ({ code: r.code, message: r.message }));
    row.decidedAt = d.decidedAt;
    return row;
  }

  public static toDomain(row: FilterDecisionEntity): FilterDecision {
    const reasons = row.reasons.map((r) =>
      FilterReason.create({ code: r.code as never, message: r.message }),
    );
    return FilterDecision.rehydrate({
      id: row.id,
      chain: ChainId.fromString(row.chain),
      address: row.address,
      verdict: FilterVerdict.fromString(row.verdict),
      score: row.score,
      classification: row.classification,
      reasons,
      decidedAt: row.decidedAt,
    });
  }
}

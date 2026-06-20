import type { FilterDecision } from 'ca/filters/domain/entities/filter-decision.entity';

export interface FilterDecisionView {
  readonly id: string;
  readonly chain: string;
  readonly address: string;
  readonly verdict: string;
  readonly score: number;
  readonly classification: string;
  readonly reasons: ReadonlyArray<{ code: string; message: string }>;
  readonly decidedAt: string;
}

export class FilterDecisionMapper {
  public static toView(d: FilterDecision): FilterDecisionView {
    return {
      id: d.id,
      chain: d.chain.value,
      address: d.address,
      verdict: d.verdict.value,
      score: d.score,
      classification: d.classification,
      reasons: d.reasons.map((r) => ({ code: r.code, message: r.message })),
      decidedAt: d.decidedAt.toISOString(),
    };
  }
}

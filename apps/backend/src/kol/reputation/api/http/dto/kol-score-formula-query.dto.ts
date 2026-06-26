import { IsOptional, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import {
  KOL_SCORE_FORMULAS,
} from 'kol/reputation/domain/value-objects/kol-score-formula.vo';

const VALID_FORMULA_IDS = Object.keys(KOL_SCORE_FORMULAS);

/**
 * Query DTO: `?formula=<id>` for endpoints that compute KOL scores
 * (currently only `POST /kols/recompute/:kolId`).
 *
 * The `id` must be one of the registered `KOL_SCORE_FORMULAS` keys:
 *   `default`, `mention-heavy`, `quality-heavy`, `balanced`.
 *
 * Defaults to `default` when omitted (handled by the use case, not the
 * DTO — keeps the validation surface explicit).
 */
export class KolScoreFormulaQueryDto {
  @IsOptional()
  @Type(() => String)
  @IsIn(VALID_FORMULA_IDS, {
    message: `formula must be one of: ${VALID_FORMULA_IDS.join(', ')}`,
  })
  public formula?: string;
}
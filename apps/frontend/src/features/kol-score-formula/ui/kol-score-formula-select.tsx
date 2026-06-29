import type { ChangeEvent } from 'react';
import {
  KOL_SCORE_FORMULAS,
  KOL_SCORE_FORMULA_OPTIONS,
  type KolScoreFormula,
} from '@/entities/kol-reputation/model/kol-score-formula';

interface KolScoreFormulaSelectProps {
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly className?: string;
}

/**
 * Dropdown that lets the operator pick a KolScoreFormula preset.
 *
 * The selection is persisted in `localStorage` by the parent
 * (`useKolScoreFormula`). The current value is the formula id, the
 * dropdown shows the human-readable name and description.
 */
export function KolScoreFormulaSelect(
  props: KolScoreFormulaSelectProps,
): React.ReactElement {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    props.onChange(e.target.value);
  };
  return (
    <div className={props.className ?? ''}>
      <label
        htmlFor="kol-score-formula"
        className="block text-xs uppercase tracking-wide text-slate-400 mb-1"
      >
        Scoring formula
      </label>
      <select
        id="kol-score-formula"
        value={props.value}
        onChange={handleChange}
        className="bg-slate-800 text-slate-100 border border-slate-700 rounded-md px-2 py-1 text-sm w-full"
      >
        {KOL_SCORE_FORMULA_OPTIONS.map((f: KolScoreFormula) => (
          <option key={f.id} value={f.id} title={f.description}>
            {f.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-slate-500">
        {KOL_SCORE_FORMULAS[props.value]?.description ?? ''}
      </p>
    </div>
  );
}

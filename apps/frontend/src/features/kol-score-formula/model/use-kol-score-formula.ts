import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_KOL_SCORE_FORMULA_ID,
  KOL_SCORE_FORMULA_IDS,
} from '@/entities/kol-reputation/model/kol-score-formula';

const STORAGE_KEY = 'kol-score-formula-id';

/**
 * Persist the operator's preferred `KolScoreFormula` in `localStorage`.
 *
 * Returns:
 *   - `formulaId` — the current value (defaults to `DEFAULT_KOL_SCORE_FORMULA_ID`)
 *   - `setFormulaId` — setValue wrapper that persists the new value
 *
 * Validates the value against `KOL_SCORE_FORMULA_IDS` — unknown ids
 * fall back to the default. SSR-safe (no window access on import).
 */
export function useKolScoreFormula(): {
  formulaId: string;
  setFormulaId: (id: string) => void;
} {
  const [formulaId, setFormulaIdState] = useState<string>(
    DEFAULT_KOL_SCORE_FORMULA_ID,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && KOL_SCORE_FORMULA_IDS.includes(stored)) {
      setFormulaIdState(stored);
    }
  }, []);

  const setFormulaId = useCallback((id: string) => {
    if (!KOL_SCORE_FORMULA_IDS.includes(id)) {
      return;
    }
    setFormulaIdState(id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  return { formulaId, setFormulaId };
}

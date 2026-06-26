import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reputationKeys, recomputeKolReputation } from '@/entities/kol-reputation/api/reputation-queries';
import type { KolScoreFormula } from '@/entities/kol-reputation/model/kol-score-formula';
import { Button } from '@/shared/ui';

interface RecomputeKolReputationButtonProps {
  readonly kolId: string;
  readonly formulaId: string;
  readonly label?: string;
  readonly size?: 'sm' | 'md' | 'lg';
}

/**
 * Button that recomputes a single KOL's reputation using the
 * currently-selected `KolScoreFormula`. On success, invalidates
 * `reputationKeys.all` so the leaderboard and per-KOL cards refresh.
 */
export function RecomputeKolReputationButton(
  props: RecomputeKolReputationButtonProps,
): React.ReactElement {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => recomputeKolReputation(props.kolId, props.formulaId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reputationKeys.all });
    },
  });
  return (
    <Button
      variant="secondary"
      size={props.size ?? 'sm'}
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      title={`Recompute using ${props.formulaId} formula`}
    >
      {mutation.isPending ? '…' : (props.label ?? 'Recompute')}
    </Button>
  );
}

export function useKolScoreFormulaLabel(
  id: string,
  formulas: Readonly<Record<string, KolScoreFormula>>,
): string {
  return formulas[id]?.name ?? id;
}
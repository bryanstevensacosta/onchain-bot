import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRejectedDiagnostics,
  reprocessBatch,
  reprocessOne,
  type ReprocessBatchInput,
  type ReprocessResult,
  type RejectedTokenDiagnostics,
} from '../api/reprocess-client';
import { decisionKeys } from '@/entities/filter-decision';

export function useRejectedDiagnostics(
  input: { limit?: number; retryableOnly?: boolean } = {},
  refetchInterval = 10_000,
) {
  return useQuery<ReadonlyArray<RejectedTokenDiagnostics>>({
    queryKey: [
      'rejected-diagnostics',
      input.limit ?? 50,
      input.retryableOnly ?? false,
    ],
    queryFn: () => fetchRejectedDiagnostics(input),
    refetchInterval,
  });
}

export function useReprocessOne() {
  const qc = useQueryClient();
  return useMutation<
    ReprocessResult,
    Error,
    { chain: string; address: string }
  >({
    mutationFn: (input) => reprocessOne(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rejected-diagnostics'] });
      void qc.invalidateQueries({ queryKey: decisionKeys.all });
    },
  });
}

export function useReprocessBatch() {
  const qc = useQueryClient();
  return useMutation<
    ReadonlyArray<ReprocessResult>,
    Error,
    ReprocessBatchInput
  >({
    mutationFn: (input) => reprocessBatch(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rejected-diagnostics'] });
      void qc.invalidateQueries({ queryKey: decisionKeys.all });
    },
  });
}

import { httpGet, httpPost } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';

export interface ProviderErrorView {
  readonly provider: string;
  readonly message: string;
}

export interface RejectedTokenDiagnostics {
  readonly chain: string;
  readonly address: string;
  readonly currentVerdict: string;
  readonly score: number;
  readonly classification: string;
  readonly reasons: ReadonlyArray<{ code: string; message: string }>;
  readonly snapshotCompleteness: number | null;
  readonly providerErrors: ReadonlyArray<ProviderErrorView>;
  readonly retryable: boolean;
  readonly retryableReasons: ReadonlyArray<{ code: string; message: string }>;
  readonly blockedReasons: ReadonlyArray<{ code: string; message: string }>;
  readonly recommended:
    | 'REPROCESS'
    | 'SKIP'
    | 'NEEDS_BLACKLIST_REVIEW'
    | 'NEEDS_CHAIN_SUPPORT';
  readonly decidedAt: string;
}

export type ReprocessStatus =
  | 'REPROCESSED'
  | 'ENRICHMENT_FAILED'
  | 'NOT_FOUND'
  | 'ERROR';

export interface ReprocessResult {
  readonly status: ReprocessStatus;
  readonly chain: string;
  readonly address: string;
  readonly previousVerdict?: string;
  readonly decision?: {
    readonly verdict: string;
    readonly score: number;
    readonly classification: string;
  };
  readonly error?: string;
}

export interface FetchDiagnosticsInput {
  limit?: number;
  retryableOnly?: boolean;
}

export interface ReprocessBatchInput {
  limit?: number;
  retryableOnly?: boolean;
  concurrency?: number;
  delayMs?: number;
}

export async function fetchRejectedDiagnostics(
  input: FetchDiagnosticsInput = {},
): Promise<ReadonlyArray<RejectedTokenDiagnostics>> {
  const limit = input.limit ?? 50;
  const retryableOnly = input.retryableOnly ?? false;
  const qs = new URLSearchParams({
    limit: String(limit),
    retryableOnly: String(retryableOnly),
  });
  return httpGet<ReadonlyArray<RejectedTokenDiagnostics>>(
    `${ENDPOINTS.filters.decisionsRejectedVerify}?${qs.toString()}`,
  );
}

export async function reprocessOne(input: {
  chain: string;
  address: string;
}): Promise<ReprocessResult> {
  return httpPost<Record<string, never>, ReprocessResult>(
    ENDPOINTS.filters.reprocessOne(input.chain, input.address),
    {},
  );
}

export async function reprocessBatch(
  input: ReprocessBatchInput,
): Promise<ReadonlyArray<ReprocessResult>> {
  return httpPost<ReprocessBatchInput, ReadonlyArray<ReprocessResult>>(
    ENDPOINTS.filters.reprocessBatch,
    input,
  );
}

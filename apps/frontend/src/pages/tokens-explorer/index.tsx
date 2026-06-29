import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useEventStream } from '@/shared/realtime';
import { decisionKeys } from '@/entities/filter-decision';
import {
  useApproved,
  useRecentDecisions,
  useRejected,
} from '@/entities/filter-decision';
import type { FilterDecisionView } from '@/entities/filter-decision';
import { useRecentScores } from '@/entities/token-score';
import { useRecentCanonical } from '@/entities/canonical-call';
import { useQuery } from '@tanstack/react-query';
import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import { Badge, Card, ChainIcon, TokenImage } from '@/shared/ui';
import { formatRelativeTime, usePagination } from '@/shared/lib';

type FilterType = 'all' | 'approved' | 'rejected';

function DecisionRow({
  decision,
  score,
  canonical,
  snapshot,
}: {
  decision: FilterDecisionView;
  score?: { score: number; tier: string } | null;
  canonical?: { ticker?: string | null } | null;
  snapshot?: {
    name?: string | null;
    imageUrls?: ReadonlyArray<string> | null;
  } | null;
}) {
  const navigate = useNavigate();
  const isApproved = decision.verdict === 'APPROVED';
  const [copied, setCopied] = useState(false);

  const name = snapshot?.name ?? null;
  const ticker =
    canonical?.ticker ?? (name ? name.slice(0, 5).toUpperCase() : null);
  const shortAddr = `${decision.address.slice(0, 6)}...${decision.address.slice(-4)}`;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(decision.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      void 0;
    }
  };

  return (
    <Card
      className="flex items-center gap-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
      onClick={() => navigate(`/tokens/${decision.chain}/${decision.address}`)}
    >
      <TokenImage
        chain={decision.chain}
        address={decision.address}
        imageUrls={snapshot?.imageUrls ?? null}
        ticker={ticker}
        name={name}
        size="lg"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {ticker && (
            <span className="text-sm font-semibold text-white">${ticker}</span>
          )}
          <Badge tone="white" className="text-[10px]">
            <ChainIcon chain={decision.chain} className="mr-0.5" />
            {decision.chain === 'solana' ? 'Solana' : 'EVM'}
          </Badge>
        </div>

        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-slate-500 font-mono">{shortAddr}</span>
          <button
            onClick={handleCopy}
            className="text-xs text-slate-400 hover:text-white transition-colors"
            aria-label="Copy address"
          >
            {copied ? '✓' : '⧉'}
          </button>
          <span className="text-[10px] text-slate-600 ml-auto">
            {formatRelativeTime(decision.decidedAt)}
          </span>
        </div>
      </div>

      <div className="shrink-0 text-right space-y-1">
        {score && (
          <div className="text-xs font-bold tabular-nums text-slate-100">
            SCORE: {score.score}
          </div>
        )}
        {isApproved ? (
          <Badge tone="green">{decision.verdict}</Badge>
        ) : (
          <Badge tone="red">{decision.verdict}</Badge>
        )}
      </div>
    </Card>
  );
}

export function TokensExplorerPage() {
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: allData, isLoading: allLoading } = useRecentDecisions(100);
  const { data: approvedData, isLoading: approvedLoading } = useApproved(100);
  const { data: rejectedData, isLoading: rejectedLoading } = useRejected(100);

  const { data: scores } = useRecentScores(50);
  const { data: canonicals } = useRecentCanonical(50);
  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', 'recent'],
    queryFn: () =>
      httpGet<
        ReadonlyArray<{
          chain: string;
          address: string;
          name: string | null;
          imageUrls: ReadonlyArray<string> | null;
        }>
      >(ENDPOINTS.enrichment.recent + '?limit=50'),
  });

  const data =
    filter === 'all'
      ? allData
      : filter === 'approved'
        ? approvedData
        : rejectedData;
  const isLoading =
    filter === 'all'
      ? allLoading
      : filter === 'approved'
        ? approvedLoading
        : rejectedLoading;

  const {
    visible,
    page,
    totalPages,
    canPrev,
    canNext,
    setPage,
    rangeStart,
    rangeEnd,
    total,
  } = usePagination(data, 10);

  const qc = useQueryClient();
  const onDecisionEvent = useCallback(() => {
    void qc.invalidateQueries({ queryKey: decisionKeys.all });
  }, [qc]);
  useEventStream('token-gating.decision.applied', onDecisionEvent);

  const scoreMap = useMemo(() => {
    const m = new Map<string, { score: number; tier: string }>();
    for (const s of scores ?? []) {
      m.set(`${s.chain}:${s.address.toLowerCase()}`, {
        score: s.score,
        tier: s.tier,
      });
    }
    return m;
  }, [scores]);

  const canonicalMap = useMemo(() => {
    const m = new Map<string, { ticker?: string | null }>();
    for (const c of canonicals ?? []) {
      m.set(`${c.chain}:${c.address.toLowerCase()}`, { ticker: c.ticker });
    }
    return m;
  }, [canonicals]);

  const snapshotMap = useMemo(() => {
    const m = new Map<
      string,
      { name: string | null; imageUrls: ReadonlyArray<string> | null }
    >();
    for (const s of snapshots ?? []) {
      m.set(`${s.chain}:${s.address.toLowerCase()}`, {
        name: s.name,
        imageUrls: s.imageUrls,
      });
    }
    return m;
  }, [snapshots]);

  const tabs: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Tokens</h1>
      <p className="text-sm text-slate-400">
        Decisiones de filtro - tokens approved vs rejected.
      </p>

      <div className="flex gap-1 border-b border-slate-700 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              filter === tab.key
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && <Card className="text-xs text-slate-500">Cargando…</Card>}

      <div className="space-y-2">
        {visible?.map((decision) => {
          const key = `${decision.chain}:${decision.address.toLowerCase()}`;
          return (
            <DecisionRow
              key={decision.id}
              decision={decision}
              score={scoreMap.get(key) ?? null}
              canonical={canonicalMap.get(key) ?? null}
              snapshot={snapshotMap.get(key) ?? null}
            />
          );
        })}
        {data?.length === 0 && !isLoading && (
          <Card className="text-center text-slate-500 italic py-8">
            No hay tokens todavía
          </Card>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 text-sm">
          <button
            disabled={!canPrev}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1 rounded bg-slate-700 disabled:opacity-30 text-slate-200"
          >
            ← Prev
          </button>
          <span className="text-slate-400">
            {rangeStart}–{rangeEnd} of {total}
          </span>
          <button
            disabled={!canNext}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1 rounded bg-slate-700 disabled:opacity-30 text-slate-200"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

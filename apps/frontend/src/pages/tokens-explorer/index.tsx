import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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

type FilterType = 'all' | 'approved' | 'rejected';

interface SnapshotEntry {
  name: string | null;
  imageUrls: ReadonlyArray<string> | null;
}

function DecisionRow({
  decision,
  score,
  canonical,
  snapshot,
}: {
  decision: FilterDecisionView;
  score?: { score: number; tier: string } | null;
  canonical?: { ticker?: string | null } | null;
  snapshot?: { name?: string | null; imageUrls?: ReadonlyArray<string> | null } | null;
}) {
  const navigate = useNavigate();
  const isApproved = decision.verdict === 'APPROVED';
  const [copied, setCopied] = useState(false);

  const name = snapshot?.name ?? null;
  const ticker = canonical?.ticker ?? (name ? name.slice(0, 5).toUpperCase() : null);
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
          {name && (
            <span className="text-xs text-slate-400 truncate max-w-[160px]">
              {name}
            </span>
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
            {copied ? '✓ copied' : '⧉'}
          </button>
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

  const { data: allData, isLoading: allLoading } = useRecentDecisions(50);
  const { data: approvedData, isLoading: approvedLoading } = useApproved(50);
  const { data: rejectedData, isLoading: rejectedLoading } = useRejected(50);

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
        {data?.map((decision) => {
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
    </div>
  );
}
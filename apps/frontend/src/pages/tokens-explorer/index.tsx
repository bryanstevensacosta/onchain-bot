import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useApproved,
  useRecentDecisions,
  useRejected,
} from '@/entities/filter-decision';
import type { FilterDecisionView } from '@/entities/filter-decision';
import { useCanonical } from '@/entities/canonical-call';
import { useSnapshot } from '@/entities/token-snapshot';
import { Badge, Card, ChainIcon } from '@/shared/ui';

type FilterType = 'all' | 'approved' | 'rejected';

function DecisionRow({ decision }: { decision: FilterDecisionView }) {
  const navigate = useNavigate();
  const isApproved = decision.verdict === 'APPROVED';

  const canonical = useCanonical(decision.chain, decision.address);
  const snapshot = useSnapshot(decision.chain, decision.address);

  const ticker = canonical.data?.ticker ?? null;
  const name = snapshot.data?.name ?? canonical.data?.name ?? null;
  const imageUrls = snapshot.data?.imageUrls ?? [];
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const currentImageUrl = imageUrls[currentImageIndex] ?? null;

  const handleImageError = () => {
    if (currentImageIndex < imageUrls.length - 1) {
      setCurrentImageIndex((prev) => prev + 1);
    } else {
      setCurrentImageIndex(imageUrls.length);
    }
  };

  const [copied, setCopied] = useState(false);

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
      <div className="shrink-0">
        {currentImageUrl ? (
          <img
            src={currentImageUrl}
            alt={name ?? ticker ?? 'Token'}
            className="w-10 h-10 rounded-full bg-slate-800 object-cover"
            onError={handleImageError}
          />
        ) : (
          <img
            src="/assets/token-placeholder.svg"
            alt="placeholder"
            className="w-10 h-10 rounded-full bg-slate-800 object-cover"
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {name && <span className="font-medium truncate">{name}</span>}
          {ticker && <span className="text-sm text-slate-400">${ticker}</span>}
          <ChainIcon chain={decision.chain} className="text-slate-500" />
        </div>

        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-500 font-mono">
            {decision.address.slice(0, 6)}...{decision.address.slice(-4)}
          </span>
          <button
            onClick={handleCopy}
            className="text-xs text-slate-400 hover:text-white transition-colors"
            aria-label="Copy address"
          >
            {copied ? '✓' : '⧉'}
          </button>
        </div>
      </div>

      <div className="shrink-0 text-right">
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
        {data?.map((decision) => (
          <DecisionRow key={decision.id} decision={decision} />
        ))}
        {data?.length === 0 && !isLoading && (
          <Card className="text-center text-slate-500 italic py-8">
            No hay tokens todavía
          </Card>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  useEventStream,
  WS_EVENTS,
  joinRoom,
  leaveRoom,
} from '@/shared/realtime';
import type {
  ScoringTokenScoredEvent,
  TokenGatingDecisionAppliedEvent,
  NormalizationCallNormalizedEvent,
} from '@/shared/realtime';
import { fetchRecentDecisions } from '@/entities/filter-decision';
import { Badge, ChainIcon } from '@/shared/ui';
import { formatRelativeTime } from '@/shared/lib/format';

type FeedItem =
  | { kind: 'scored'; at: number; data: ScoringTokenScoredEvent }
  | { kind: 'decision'; at: number; data: TokenGatingDecisionAppliedEvent }
  | { kind: 'normalized'; at: number; data: NormalizationCallNormalizedEvent };

const MAX_ITEMS = 50;

export function LiveFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [tab, setTab] = useState<'all' | 'scored' | 'decision'>('all');

  useEventStream<ScoringTokenScoredEvent>(WS_EVENTS.ScoringScored, (data) => {
    const at = data.scoredAt ? new Date(data.scoredAt).getTime() : Date.now();
    setItems((prev) =>
      [{ kind: 'scored' as const, at, data }, ...prev].slice(0, MAX_ITEMS),
    );
  });

  useEventStream<TokenGatingDecisionAppliedEvent>(
    WS_EVENTS.FiltersDecision,
    (data) => {
      const at = data.decidedAt
        ? new Date(data.decidedAt).getTime()
        : Date.now();
      setItems((prev) =>
        [{ kind: 'decision' as const, at, data }, ...prev].slice(0, MAX_ITEMS),
      );
    },
  );

  useEventStream<NormalizationCallNormalizedEvent>(
    WS_EVENTS.NormalizationNormalized,
    (data) => {
      const at = data.lastSeenAt
        ? new Date(data.lastSeenAt).getTime()
        : Date.now();
      setItems((prev) =>
        [{ kind: 'normalized' as const, at, data }, ...prev].slice(
          0,
          MAX_ITEMS,
        ),
      );
    },
  );

  useEffect(() => {
    joinRoom('chain:solana');
    joinRoom('chain:evm');
    return () => {
      leaveRoom('chain:solana');
      leaveRoom('chain:evm');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const decisions = await fetchRecentDecisions(10);
        if (cancelled) return;
        const historical: FeedItem[] = decisions.map(
          (d: (typeof decisions)[number]) => ({
            kind: 'decision' as const,
            at: new Date(d.decidedAt).getTime(),
            data: {
              chain: d.chain,
              address: d.address,
              verdict: d.verdict,
              reasons: d.reasons,
              decidedAt: d.decidedAt,
            },
          }),
        );
        setItems((prev) => {
          const seen = new Set(
            prev.map((i) => `${i.at}-${i.kind}-${i.data.address}`),
          );
          const fresh = historical.filter(
            (h) => !seen.has(`${h.at}-${h.kind}-${h.data.address}`),
          );
          return [...fresh, ...prev].slice(0, MAX_ITEMS);
        });
      } catch {
        void 0;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = items.filter((i) => (tab === 'all' ? true : i.kind === tab));

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs">
        <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
          all ({items.length})
        </TabButton>
        <TabButton active={tab === 'scored'} onClick={() => setTab('scored')}>
          scored ({items.filter((i) => i.kind === 'scored').length})
        </TabButton>
        <TabButton
          active={tab === 'decision'}
          onClick={() => setTab('decision')}
        >
          filtered ({items.filter((i) => i.kind === 'decision').length})
        </TabButton>
      </div>
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto scrollbar-thin">
        {filtered.length === 0 && (
          <div className="text-xs text-slate-500 italic py-4 text-center">
            Esperando eventos del pipeline… (WS conectado)
          </div>
        )}
        {filtered.map((item, idx) => (
          <FeedRow key={`${item.at}-${idx}`} item={item} />
        ))}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === 'scored') {
    const d = item.data;
    const tone =
      d.score >= 70
        ? 'green'
        : d.score >= 50
          ? 'yellow'
          : d.score >= 30
            ? 'orange'
            : 'red';
    const timestamp = d.scoredAt
      ? formatRelativeTime(d.scoredAt)
      : formatRelativeTime(new Date(item.at).toISOString());
    return (
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <Badge tone="white">
            <ChainIcon chain={d.chain} className="mr-1" />
            {d.chain === 'solana' ? 'Solana' : 'EVM'}
          </Badge>
          {d.ticker && (
            <span className="font-medium text-slate-100">${d.ticker}</span>
          )}
          <span className="font-mono text-slate-400">
            {d.address.slice(0, 6)}…{d.address.slice(-4)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={tone}>
            score {d.score} · {d.tier}
          </Badge>
          <span className="text-slate-500">{timestamp}</span>
        </div>
      </div>
    );
  }
  if (item.kind === 'decision') {
    const d = item.data;
    const timestamp = d.decidedAt
      ? formatRelativeTime(d.decidedAt)
      : formatRelativeTime(new Date(item.at).toISOString());
    return (
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <Badge tone="white">
            <ChainIcon chain={d.chain} className="mr-1" />
            {d.chain === 'solana' ? 'Solana' : 'EVM'}
          </Badge>
          <span className="font-mono text-slate-400">
            {d.address.slice(0, 6)}…{d.address.slice(-4)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={d.verdict === 'APPROVED' ? 'green' : 'red'}>
            {d.verdict}
          </Badge>
          <span className="text-slate-500">{timestamp}</span>
        </div>
      </div>
    );
  }
  // normalized
  const d = item.data;
  const timestamp = d.lastSeenAt
    ? formatRelativeTime(d.lastSeenAt)
    : formatRelativeTime(new Date(item.at).toISOString());
  return (
    <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <Badge tone="white">
          <ChainIcon chain={d.chain} className="mr-1" />
          {d.chain === 'solana' ? 'Solana' : 'EVM'}
        </Badge>
        <span className="font-mono text-slate-400">
          {d.address.slice(0, 6)}…{d.address.slice(-4)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone="gray">canonical</Badge>
        <span className="text-slate-500">mentions: {d.mentionCount}</span>
        <span className="text-slate-500">{timestamp}</span>
      </div>
    </div>
  );
}

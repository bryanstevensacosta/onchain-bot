import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LiveFeed } from '@/widgets/live-feed';
import { getSocket } from '@/shared/realtime';
import { useRecentDecisions } from '@/entities/filter-decision';
import { useRecentScores } from '@/entities/token-score';
import { useRecentCanonical } from '@/entities/canonical-call';
import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import { Badge, Card, ChainIcon, TokenImage } from '@/shared/ui';

function TokenRow({
  decision,
  score,
  canonical,
  snapshot,
}: {
  decision: { chain: string; address: string; verdict: string };
  score?: { score: number; tier: string } | null;
  canonical?: { ticker?: string | null } | null;
  snapshot?: { name?: string | null; imageUrls?: ReadonlyArray<string> | null } | null;
}) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const ticker = canonical?.ticker ?? null;
  const name = snapshot?.name ?? null;
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
        </div>
      </div>

      <div className="shrink-0 text-right space-y-1">
        {score && (
          <div className="text-xs font-bold tabular-nums text-slate-100">
            SCORE: {score.score}
          </div>
        )}
        {decision.verdict === 'APPROVED' ? (
          <Badge tone="green">{decision.verdict}</Badge>
        ) : (
          <Badge tone="red">{decision.verdict}</Badge>
        )}
      </div>
    </Card>
  );
}

export function LiveFeedPage() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    setConnected(socket.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const { data: decisions } = useRecentDecisions(20);
  const { data: scores } = useRecentScores(20);
  const { data: canonicals } = useRecentCanonical(20);
  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', 'recent', 'live'],
    queryFn: () =>
      httpGet<
        ReadonlyArray<{
          chain: string;
          address: string;
          name: string | null;
          imageUrls: ReadonlyArray<string> | null;
        }>
      >(ENDPOINTS.enrichment.recent + '?limit=20'),
  });

  const scoreMap = useMemo(() => {
    const m = new Map<string, { score: number; tier: string }>();
    for (const s of scores ?? [])
      m.set(`${s.chain}:${s.address.toLowerCase()}`, { score: s.score, tier: s.tier });
    return m;
  }, [scores]);

  const canonicalMap = useMemo(() => {
    const m = new Map<string, { ticker?: string | null }>();
    for (const c of canonicals ?? [])
      m.set(`${c.chain}:${c.address.toLowerCase()}`, { ticker: c.ticker });
    return m;
  }, [canonicals]);

  const snapshotMap = useMemo(() => {
    const m = new Map<string, { name: string | null; imageUrls: ReadonlyArray<string> | null }>();
    for (const s of snapshots ?? [])
      m.set(`${s.chain}:${s.address.toLowerCase()}`, { name: s.name, imageUrls: s.imageUrls });
    return m;
  }, [snapshots]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live feed</h1>
          <p className="text-sm text-slate-400">
            Eventos del pipeline en tiempo real vía WebSocket.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-slate-400">
            {connected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>

      <LiveFeed />

      <div className="pt-4 border-t border-slate-700">
        <h2 className="text-lg font-bold mb-2">Recent tokens</h2>
        <div className="space-y-2">
          {decisions?.map((d) => {
            const key = `${d.chain}:${d.address.toLowerCase()}`;
            return (
              <TokenRow
                key={d.id}
                decision={d}
                score={scoreMap.get(key) ?? null}
                canonical={canonicalMap.get(key) ?? null}
                snapshot={snapshotMap.get(key) ?? null}
              />
            );
          })}
          {decisions?.length === 0 && (
            <Card className="text-center text-slate-500 italic py-8">
              No hay tokens todavía
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
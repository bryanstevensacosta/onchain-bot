import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCanonical } from '@/entities/canonical-call';
import { useScoreByToken } from '@/entities/token-score';
import { useSnapshot } from '@/entities/token-snapshot';
import {
  Card,
  Badge,
  Button,
  ChainIcon,
  LiquidityGauge,
  TokenImage,
} from '@/shared/ui';
import { ScoreGauge, ScoreBreakdown } from '@/entities/token-score';
import { formatPercent, formatRelativeTime, formatUsd } from '@/shared/lib';

export function TokenDetailPage() {
  const { chain = '', address = '' } = useParams<{
    chain: string;
    address: string;
  }>();

  const canonical = useCanonical(chain, address);
  const score = useScoreByToken(chain, address);
  const snapshot = useSnapshot(chain, address);

  const displayName =
    canonical.data?.name ?? snapshot.data?.name ?? score.data?.ticker ?? null;

  return (
    <div className="space-y-4 p-6">
      {/* Header: image + name + ticker + chain */}
      <div className="flex items-center gap-4">
        <TokenImage
          chain={chain}
          address={address}
          imageUrls={snapshot.data?.imageUrls ?? null}
          name={displayName}
          ticker={score.data?.ticker ?? null}
          size="lg"
        />
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {displayName && <h1 className="text-2xl font-bold">{displayName}</h1>}
          {score.data?.ticker && (
            <span className="text-lg text-slate-400">${score.data.ticker}</span>
          )}
          <Badge tone="white">
            <ChainIcon chain={chain} className="mr-1" />
            {chain === 'solana' ? 'Solana' : 'EVM'}
          </Badge>
        </div>
      </div>

      <Card>
        <h3 className="text-xs uppercase text-slate-400 mb-2">Contract</h3>
        <ContractAddress value={address} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-xs uppercase text-slate-400 mb-2">Score</h3>
          {score.data && (
            <div className="space-y-3">
              <ScoreGauge score={score.data.score} tier={score.data.tier} />
              {score.data.breakdown && score.data.breakdown.length > 0 && (
                <div className="pt-2 border-t border-slate-700">
                  <h4 className="text-xs uppercase text-slate-500 mb-2">
                    Factors
                  </h4>
                  <ScoreBreakdown factors={score.data.breakdown} />
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-xs uppercase text-slate-400 mb-2">
            Market snapshot
          </h3>
          {snapshot.data ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Field label="Price" value={formatUsd(snapshot.data.priceUsd)} />
              <Field
                label="Liquidity"
                value={
                  <>
                    {formatUsd(snapshot.data.liquidityUsd)}
                    <LiquidityGauge
                      lockedPercent={snapshot.data.lockedLiquidityPercent}
                      burnedPercent={snapshot.data.burnedPercent}
                      hasData={snapshot.data.hasRugcheckData}
                    />
                  </>
                }
              />
              <Field label="FDV" value={formatUsd(snapshot.data.fdvUsd)} />
              <Field label="MC" value={formatUsd(snapshot.data.marketCapUsd)} />
              <Field
                label="Holders"
                value={snapshot.data.holders?.toString() ?? '—'}
              />
              <Field label="Pairs" value={String(snapshot.data.pairCount)} />
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              {snapshot.isLoading ? 'Cargando…' : 'Sin snapshot de mercado'}
            </div>
          )}
        </Card>

        <Card className="md:col-span-2">
          <h3 className="text-xs uppercase text-slate-400 mb-2">Canonical</h3>
          {canonical.data ? (
            <div className="text-sm space-y-1">
              <div>
                Mentions:{' '}
                <span className="text-slate-100">
                  {canonical.data.mentionCount}
                </span>
              </div>
              <div>
                Confidence:{' '}
                <span className="text-slate-100">
                  {formatPercent(canonical.data.confidence)}
                </span>
              </div>
              <div>
                First seen:{' '}
                <span className="text-slate-100">
                  {formatRelativeTime(canonical.data.firstSeenAt)}
                </span>
              </div>
              <div>
                Last seen:{' '}
                <span className="text-slate-100">
                  {formatRelativeTime(canonical.data.lastSeenAt)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Sin canonical data</div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-slate-100 tabular-nums flex items-center gap-2">
        {value}
      </div>
    </div>
  );
}

function ContractAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="break-all text-xs text-slate-200 bg-slate-900/60 border border-slate-800 rounded px-2 py-1.5 flex-1 min-w-0">
        {value || '—'}
      </code>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleCopy}
        disabled={!value}
        aria-label="Copiar contrato"
      >
        {copied ? 'Copiado' : 'Copiar'}
      </Button>
    </div>
  );
}

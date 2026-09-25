import { useState } from 'react';
import {
  addressKindTone,
  chartUrlFor,
  normalizeAddressKind,
  useAddressSnapshot,
  useCompatSnapshot,
} from '@/entities/market-data';
import { Badge, Button, Card } from '@/shared/ui';

type DexterCommand = 'x' | 'c';

interface ParsedScan {
  readonly command: DexterCommand;
  readonly chain: string;
  readonly address: string;
}

function parseDexterInput(raw: string): ParsedScan | null {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const first = parts[0].toLowerCase();
  if ((first === '/x' || first === '/c') && parts.length >= 3) {
    return {
      command: first.slice(1) as DexterCommand,
      chain: parts[1],
      address: parts[2],
    };
  }
  if (parts.length >= 2 && !parts[0].startsWith('/')) {
    return { command: 'x', chain: parts[0], address: parts[1] };
  }
  return null;
}

function FullScanCard({ chain, address }: { chain: string; address: string }) {
  const snapshot = useAddressSnapshot(chain, address, 'token');
  const compat = useCompatSnapshot(chain, address);

  if (snapshot.isPending || compat.isPending) {
    return <div data-testid="dexter-scan-loading">Cargando…</div>;
  }
  if (snapshot.isError || compat.isError) {
    return (
      <div data-testid="dexter-scan-empty">
        Market-data API down — no scan available.
      </div>
    );
  }
  if (!snapshot.data || !compat.data) {
    return null;
  }
  const kind = normalizeAddressKind(snapshot.data.kind);
  return (
    <div data-testid="dexter-scan-result" className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="dexter-kind-badge">
          <Badge
            tone={
              addressKindTone(kind) as
                | 'blue'
                | 'green'
                | 'cyan'
                | 'yellow'
                | 'gray'
            }
          >
            {kind}
          </Badge>
        </span>
        <span className="font-mono text-slate-200">
          {compat.data.symbol ?? compat.data.name ?? snapshot.data.key}
        </span>
        <span className="font-mono text-slate-500">
          {chain}:{address}
        </span>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div>
          <dt className="text-slate-500">Price USD</dt>
          <dd className="font-mono">{compat.data.priceUsd ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Market cap</dt>
          <dd className="font-mono">{compat.data.marketCapUsd ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Liquidity</dt>
          <dd className="font-mono">{compat.data.liquidityUsd ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">24h change</dt>
          <dd className="font-mono">{compat.data.priceChange24h ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Holders</dt>
          <dd className="font-mono">{compat.data.holders ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Top-10 %</dt>
          <dd className="font-mono">{compat.data.top10HolderPercent ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Status</dt>
          <dd className="font-mono">{snapshot.data.status}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Providers</dt>
          <dd className="font-mono">
            {snapshot.data.providers.join(', ') || '—'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ChartCard({ chain, address }: { chain: string; address: string }) {
  const snapshot = useCompatSnapshot(chain, address);

  if (snapshot.isPending) {
    return <div data-testid="dexter-chart-loading">Cargando…</div>;
  }
  if (snapshot.isError || !snapshot.data) {
    return (
      <div data-testid="dexter-chart-empty">
        Market-data API down — no chart context available.
      </div>
    );
  }
  const urls = chartUrlFor(chain, address);
  return (
    <div data-testid="dexter-chart-result" className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-slate-200">
          {snapshot.data.symbol ?? snapshot.data.name ?? address}
        </span>
        <span className="font-mono text-slate-500">
          {snapshot.data.priceUsd ?? '—'} USD
        </span>
      </div>
      <div className="flex gap-4">
        <a
          data-testid="dexter-dexscreener-link"
          className="text-blue-400 underline"
          href={urls.dexscreener}
          target="_blank"
          rel="noreferrer"
        >
          DexScreener
        </a>
        <a
          data-testid="dexter-geckoterminal-link"
          className="text-blue-400 underline"
          href={urls.geckoterminal}
          target="_blank"
          rel="noreferrer"
        >
          GeckoTerminal
        </a>
      </div>
    </div>
  );
}

export function DexterPage() {
  const [input, setInput] = useState('');
  const [scan, setScan] = useState<ParsedScan | null>(null);
  const [parseError, setParseError] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-slate-100">Dexter</h1>
      <Card>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = parseDexterInput(input);
            setParseError(parsed === null);
            setScan(parsed);
          }}
        >
          <input
            data-testid="dexter-input"
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono"
            placeholder="/x solana <address> · /c ethereum <address>"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <Button type="submit" size="sm" data-testid="dexter-submit">
            Scan
          </Button>
        </form>
        {parseError && (
          <div
            data-testid="dexter-parse-error"
            className="text-sm text-red-400 mt-2"
          >
            Usage: /x &lt;chain&gt; &lt;address&gt; or /c &lt;chain&gt;
            &lt;address&gt;.
          </div>
        )}
        {scan && (
          <div className="mt-4" data-testid={`dexter-${scan.command}`}>
            {scan.command === 'x' ? (
              <FullScanCard chain={scan.chain} address={scan.address} />
            ) : (
              <ChartCard chain={scan.chain} address={scan.address} />
            )}
          </div>
        )}
        {!scan && !parseError && (
          <div
            data-testid="dexter-idle"
            className="text-sm text-slate-500 mt-2"
          >
            Dexter lookup runs on market-data HTTP — no bot token needed.
          </div>
        )}
      </Card>
    </div>
  );
}

import {
  addressKindTone,
  chartUrlFor,
  detectChainForAddress,
  DevRiskBadge,
  normalizeAddressKind,
  useAddressSnapshot,
  useCompatSnapshot,
  useDevDumpAlert,
} from '@/entities/market-data';
import { Badge } from '@/shared/ui';

export type DexterCommand = 'x' | 'c';

export interface ParsedScan {
  readonly command: DexterCommand;
  readonly chain: string;
  readonly address: string;
  readonly chainSource: 'explicit' | 'detected';
  readonly candidates?: ReadonlyArray<string>;
}

export function parseDexterInput(raw: string): ParsedScan | null {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const first = parts[0].toLowerCase();
  const command = first === '/x' ? 'x' : first === '/c' ? 'c' : null;
  if (command !== null) {
    if (parts.length >= 3) {
      return {
        command,
        chain: parts[1],
        address: parts[2],
        chainSource: 'explicit',
      };
    }
    if (parts.length === 2) {
      const detected = detectChainForAddress(parts[1]);
      if (detected === null) return null;
      return {
        command,
        chain: detected.chain,
        address: parts[1],
        chainSource: 'detected',
        candidates: detected.candidates,
      };
    }
    return null;
  }
  if (parts.length === 1) {
    const detected = detectChainForAddress(parts[0]);
    if (detected === null) return null;
    return {
      command: 'x',
      chain: detected.chain,
      address: parts[0],
      chainSource: 'detected',
      candidates: detected.candidates,
    };
  }
  if (parts[0].startsWith('/')) return null;
  if (detectChainForAddress(parts[0]) !== null) return null;
  return {
    command: 'x',
    chain: parts[0],
    address: parts[1],
    chainSource: 'explicit',
  };
}

export function FullScanCard({
  chain,
  address,
}: {
  chain: string;
  address: string;
}) {
  const snapshot = useAddressSnapshot(chain, address, 'token');
  const compat = useCompatSnapshot(chain, address);
  const devAlert = useDevDumpAlert(compat.data?.devPctSupply ?? null);

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
        <DevRiskBadge
          devPctSupply={compat.data.devPctSupply ?? null}
          devWallets={compat.data.devWallets ?? null}
        />
        {devAlert.triggered && (
          <span data-testid="dexter-dev-alert" className="text-xs text-red-400">
            {devAlert.reason}
          </span>
        )}
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
          <dt className="text-slate-500">FDV</dt>
          <dd className="font-mono">{compat.data.fdvUsd ?? '—'}</dd>
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
          <dt className="text-slate-500">Total supply</dt>
          <dd className="font-mono">{compat.data.totalSupply ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Circulating</dt>
          <dd className="font-mono">{compat.data.circulatingSupply ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Max supply</dt>
          <dd className="font-mono">{compat.data.maxSupply ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Dev % supply</dt>
          <dd className="font-mono" data-testid="dexter-dev-pct">
            {compat.data.devPctSupply ?? '—'}
          </dd>
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

export function ChartCard({
  chain,
  address,
}: {
  chain: string;
  address: string;
}) {
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

export function ScanResultView({ scan }: { scan: ParsedScan }) {
  return (
    <div className="mt-4" data-testid={`dexter-${scan.command}`}>
      {scan.chainSource === 'detected' && (
        <div
          data-testid="dexter-detected-chain"
          className="text-xs text-slate-400 mb-2"
        >
          Detected chain: {scan.chain} (from address format).
        </div>
      )}
      {scan.candidates && scan.candidates.length > 1 && (
        <div
          data-testid="dexter-ambiguous-hint"
          className="text-xs text-amber-300 mb-2"
        >
          EVM address — showing {scan.chain}. For another EVM chain, retry with
          an explicit qualifier ({scan.candidates.join(', ')}).
        </div>
      )}
      {scan.command === 'x' ? (
        <FullScanCard chain={scan.chain} address={scan.address} />
      ) : (
        <ChartCard chain={scan.chain} address={scan.address} />
      )}
    </div>
  );
}

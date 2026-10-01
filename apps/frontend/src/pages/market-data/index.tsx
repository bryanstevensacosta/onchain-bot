import { useState } from 'react';
import {
  addressKindTone,
  fetchBatchSnapshots,
  normalizeAddressKind,
  providerHealthTone,
  useAddressSnapshot,
  useCompatSnapshot,
  useDetectChain,
  useMarketChains,
  useMarketProviders,
  type BatchSnapshotItem,
} from '@/entities/market-data';
import { Badge, Button, Card } from '@/shared/ui';

function ChainsSection() {
  const { data, isPending, isError } = useMarketChains();
  const [probe, setProbe] = useState('');
  const [detectAddress, setDetectAddress] = useState<string | null>(null);
  const detect = useDetectChain(detectAddress);

  if (isPending) {
    return <div data-testid="market-chains-loading">Cargando…</div>;
  }
  if (isError || !data) {
    return (
      <div data-testid="market-chains-empty">
        Market-data API down — no chains available.
      </div>
    );
  }
  return (
    <div data-testid="market-chains">
      <div className="flex flex-wrap gap-2 mb-3">
        {data.map((chain) => (
          <span key={chain.id} data-testid={`chain-${chain.id}`}>
            <Badge tone="blue">
              {chain.displayName} · {chain.nativeSymbol}
            </Badge>
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setDetectAddress(probe.trim() ? probe.trim() : null);
        }}
      >
        <input
          data-testid="detect-input"
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono"
          placeholder="Probe address for detect-chain…"
          value={probe}
          onChange={(e) => setProbe(e.target.value)}
        />
        <Button type="submit" size="sm" data-testid="detect-submit">
          Detect
        </Button>
      </form>
      {detect.data && (
        <div
          data-testid="detect-result"
          className="text-sm text-slate-300 mt-2"
        >
          Chain: {detect.data.chain ?? '—'} · Family:{' '}
          {detect.data.family ?? '—'}
        </div>
      )}
      {detect.isError && (
        <div data-testid="detect-error" className="text-sm text-red-400 mt-2">
          Detect failed — market-data unreachable.
        </div>
      )}
    </div>
  );
}

function ProvidersSection() {
  const { data, isPending, isError } = useMarketProviders();

  if (isPending) {
    return <div data-testid="market-providers-loading">Cargando…</div>;
  }
  if (isError || !data) {
    return (
      <div data-testid="market-providers-empty">
        Market-data API down — no providers available.
      </div>
    );
  }
  return (
    <table data-testid="market-providers" className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-1">Provider</th>
          <th>Kind</th>
          <th>Status</th>
          <th>Latency</th>
          <th>Errors</th>
        </tr>
      </thead>
      <tbody>
        {data.map((p) => (
          <tr
            key={p.name}
            data-testid={`provider-${p.name}`}
            className="border-t border-slate-800"
          >
            <td className="py-1 font-mono text-slate-200">{p.name}</td>
            <td className="text-slate-400">{p.kind}</td>
            <td>
              <Badge
                tone={
                  providerHealthTone(p.status) as
                    | 'green'
                    | 'yellow'
                    | 'red'
                    | 'gray'
                }
              >
                {p.status}
              </Badge>
            </td>
            <td className="text-slate-400">
              {p.latencyMs === null ? '—' : `${p.latencyMs}ms`}
            </td>
            <td className="text-slate-400">{p.errorCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AddressLookupSection() {
  const [chain, setChain] = useState('solana');
  const [address, setAddress] = useState('');
  const [kind, setKind] = useState('');
  const [submitted, setSubmitted] = useState<{
    chain: string;
    address: string;
    kind?: string;
  } | null>(null);
  const snapshot = useAddressSnapshot(
    submitted?.chain ?? null,
    submitted?.address ?? null,
    submitted?.kind,
  );

  return (
    <div data-testid="market-address-lookup">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim()) {
            setSubmitted({
              chain: chain.trim(),
              address: address.trim(),
              kind: kind.trim() ? kind.trim() : undefined,
            });
          }
        }}
      >
        <input
          data-testid="lookup-chain"
          className="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono"
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          aria-label="Chain"
        />
        <input
          data-testid="lookup-address"
          className="flex-1 min-w-52 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono"
          placeholder="Address…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <input
          data-testid="lookup-kind"
          className="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono"
          placeholder="kind?"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Kind hint"
        />
        <Button type="submit" size="sm" data-testid="lookup-submit">
          Lookup
        </Button>
      </form>
      {snapshot.isPending && submitted && (
        <div data-testid="lookup-loading">Cargando…</div>
      )}
      {snapshot.isError && (
        <div data-testid="lookup-empty">
          Market-data API down — no snapshot available.
        </div>
      )}
      {snapshot.data && (
        <div
          data-testid="lookup-result"
          className="mt-2 text-sm flex flex-wrap items-center gap-2"
        >
          <span data-testid="lookup-kind-badge">
            <Badge
              tone={
                addressKindTone(normalizeAddressKind(snapshot.data.kind)) as
                  | 'blue'
                  | 'green'
                  | 'cyan'
                  | 'yellow'
                  | 'gray'
              }
            >
              {snapshot.data.kind}
            </Badge>
          </span>
          <span className="font-mono text-slate-300">{snapshot.data.key}</span>
          <span className="text-slate-500">
            status: {snapshot.data.status} · providers:{' '}
            {snapshot.data.providers.join(', ') || '—'}
          </span>
        </div>
      )}
    </div>
  );
}

function CompatSnapshotSection() {
  const [chain, setChain] = useState('solana');
  const [address, setAddress] = useState('');
  const [submitted, setSubmitted] = useState<{
    chain: string;
    address: string;
  } | null>(null);
  const snapshot = useCompatSnapshot(
    submitted?.chain ?? null,
    submitted?.address ?? null,
  );

  return (
    <div data-testid="market-compat-snapshot">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim()) {
            setSubmitted({ chain: chain.trim(), address: address.trim() });
          }
        }}
      >
        <input
          data-testid="compat-chain"
          className="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono"
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          aria-label="Chain"
        />
        <input
          data-testid="compat-address"
          className="flex-1 min-w-52 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono"
          placeholder="Token address…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Button type="submit" size="sm" data-testid="compat-submit">
          Snapshot
        </Button>
      </form>
      {snapshot.isPending && submitted && (
        <div data-testid="compat-loading">Cargando…</div>
      )}
      {snapshot.isError && (
        <div data-testid="compat-empty">
          Market-data API down — no snapshot available.
        </div>
      )}
      {snapshot.data && (
        <dl
          data-testid="compat-result"
          className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm"
        >
          <div>
            <dt className="text-slate-500">Price USD</dt>
            <dd className="font-mono">{snapshot.data.priceUsd ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Market cap</dt>
            <dd className="font-mono">{snapshot.data.marketCapUsd ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Liquidity</dt>
            <dd className="font-mono">{snapshot.data.liquidityUsd ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Holders</dt>
            <dd className="font-mono">{snapshot.data.holders ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Symbol</dt>
            <dd className="font-mono">{snapshot.data.symbol ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Kind</dt>
            <dd>
              <span data-testid="compat-kind-badge">
                <Badge
                  tone={
                    addressKindTone(
                      normalizeAddressKind(snapshot.data.kind),
                    ) as 'blue' | 'green' | 'cyan' | 'yellow' | 'gray'
                  }
                >
                  {snapshot.data.kind}
                </Badge>
              </span>
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
      )}
    </div>
  );
}

function BatchSection() {
  const [text, setText] = useState('');
  const [items, setItems] = useState<ReadonlyArray<BatchSnapshotItem> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    const parsed = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [chain, address, kind] = line.split(/\s+/);
        return { chain, address, kind };
      })
      .filter((row) => row.chain && row.address);
    setPending(true);
    setError(null);
    try {
      const res = await fetchBatchSnapshots(parsed);
      setItems(res.snapshots);
    } catch {
      setError('Market-data API down — batch failed.');
      setItems(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div data-testid="market-batch">
      <textarea
        data-testid="batch-input"
        className="w-full h-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono"
        placeholder={'One per line: <chain> <address> [kind]'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        size="sm"
        className="mt-2"
        data-testid="batch-submit"
        onClick={() => void submit()}
      >
        {pending ? 'Loading…' : 'Batch lookup'}
      </Button>
      {error && (
        <div data-testid="batch-empty" className="mt-2 text-sm text-slate-400">
          {error}
        </div>
      )}
      {items && (
        <ul data-testid="batch-result" className="mt-2 space-y-1 text-sm">
          {items.map((item, i) => (
            <li
              key={`${item.chain}:${item.address}:${i}`}
              data-testid={`batch-row-${i}`}
              className="font-mono text-slate-300"
            >
              {item.chain}:{item.address} →{' '}
              {item.error ? (
                <span className="text-red-400">{item.error}</span>
              ) : (
                <span>
                  {item.kind} · {item.status}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MarketDataPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-slate-100">Market Data</h1>
      <Card>
        <h2 className="text-sm font-semibold text-slate-300 mb-2">Chains</h2>
        <ChainsSection />
      </Card>
      <Card>
        <h2 className="text-sm font-semibold text-slate-300 mb-2">Providers</h2>
        <ProvidersSection />
      </Card>
      <Card>
        <h2 className="text-sm font-semibold text-slate-300 mb-2">
          Address lookup
        </h2>
        <AddressLookupSection />
      </Card>
      <Card>
        <h2 className="text-sm font-semibold text-slate-300 mb-2">
          Token snapshot (compat)
        </h2>
        <CompatSnapshotSection />
      </Card>
      <Card>
        <h2 className="text-sm font-semibold text-slate-300 mb-2">
          Batch lookup (50 max)
        </h2>
        <BatchSection />
      </Card>
    </div>
  );
}

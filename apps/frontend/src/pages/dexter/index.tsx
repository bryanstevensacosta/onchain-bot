import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ENDPOINTS } from '@/shared/api/endpoints';
import { httpGet, httpPost } from '@/shared/api/http-client';
import { Badge, Button, Card } from '@/shared/ui';
import {
  parseDexterInput,
  ScanResultView,
  type ParsedScan,
} from './scan-views';
import { ScanSearchModal } from './scan-search-modal';
import { useRecentScans } from './use-recent-scans';

export { parseDexterInput };
export type { ParsedScan };

interface GatewayInventoryRow {
  readonly id: string;
  readonly label: string;
  readonly ownerApp: string;
  readonly boundApp: string | null;
  readonly available: boolean;
}

function DexterBotBindingSection() {
  const queryClient = useQueryClient();
  const inventory = useQuery({
    queryKey: ['dexter', 'bot-inventory'],
    queryFn: () => httpGet<GatewayInventoryRow[]>(ENDPOINTS.dexter.inventory),
    retry: false,
  });
  const bind = useMutation({
    mutationFn: (vaultId: string) =>
      httpPost<{ vaultId: string }, unknown>(ENDPOINTS.dexter.bind, {
        vaultId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['dexter', 'bot-inventory'] }),
  });
  const unbind = useMutation({
    mutationFn: (vaultId: string) =>
      httpPost<{ vaultId: string }, unknown>(ENDPOINTS.dexter.unbind, {
        vaultId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['dexter', 'bot-inventory'] }),
  });
  const migrate = useMutation({
    mutationFn: () =>
      httpPost<Record<string, never>, unknown>(ENDPOINTS.dexter.migrate, {}),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['dexter', 'bot-inventory'] }),
  });

  return (
    <Card>
      <h2 className="text-sm font-bold text-slate-100">Bot binding</h2>
      <p className="text-xs text-slate-500 mt-1">
        Dexter sends only via its gateway-bound bot — pick it from the gateway
        inventory (link-as-target). One bot serves one app; a bot locked by
        another app cannot be bound here.
      </p>
      <div className="flex gap-2 mt-2">
        <Button
          size="sm"
          data-testid="dexter-bot-create"
          disabled={migrate.isPending}
          onClick={() => migrate.mutate()}
        >
          Create from env token
        </Button>
      </div>
      {migrate.isError && (
        <div
          data-testid="dexter-bot-error"
          className="text-xs text-red-400 mt-2"
        >
          Create failed — is the dexter service up?
        </div>
      )}
      {inventory.isPending && (
        <div
          data-testid="dexter-bot-loading"
          className="text-xs text-slate-500 mt-2"
        >
          Cargando…
        </div>
      )}
      {inventory.isError && (
        <div
          data-testid="dexter-bot-empty"
          className="text-xs text-slate-500 mt-2"
        >
          Bot inventory unavailable — is the dexter service up?
        </div>
      )}
      {inventory.data && (
        <ul
          data-testid="dexter-bot-inventory"
          className="mt-2 space-y-1 text-sm"
        >
          {inventory.data.map((row) => (
            <li
              key={row.id}
              data-testid={`dexter-bot-row-${row.id}`}
              className="flex flex-wrap items-center gap-2 font-mono text-xs"
            >
              <span className="text-slate-200">{row.label}</span>
              <span className="text-slate-500">{row.id}</span>
              <Badge tone={row.available ? 'green' : 'gray'}>
                {row.available
                  ? 'available'
                  : `bound:${row.boundApp ?? row.ownerApp}`}
              </Badge>
              {row.available ? (
                <Button
                  size="sm"
                  data-testid={`dexter-bot-link-${row.id}`}
                  disabled={bind.isPending}
                  onClick={() => bind.mutate(row.id)}
                >
                  Link as target
                </Button>
              ) : (
                <Button
                  size="sm"
                  data-testid={`dexter-bot-unlink-${row.id}`}
                  disabled={unbind.isPending}
                  onClick={() => unbind.mutate(row.id)}
                >
                  Unlink
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(bind.isError || unbind.isError) && (
        <div
          data-testid="dexter-bot-error"
          className="text-xs text-red-400 mt-2"
        >
          Binding failed — the bot may be locked by another app (exclusive).
        </div>
      )}
    </Card>
  );
}

export function DexterPage() {
  const [input, setInput] = useState('');
  const [scan, setScan] = useState<ParsedScan | null>(null);
  const [parseError, setParseError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { recent, addRecent, clearRecent } = useRecentScans();

  const runSearch = (raw: string) => {
    const parsed = parseDexterInput(raw);
    setParseError(parsed === null);
    setScan(parsed);
    if (parsed !== null) addRecent(raw);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-slate-100">Dexter</h1>
      <DexterBotBindingSection />
      <Card>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(input);
          }}
        >
          <input
            data-testid="dexter-input"
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono"
            placeholder="/x solana <address> · /c ethereum <address> · or paste a bare address"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <Button type="submit" size="sm" data-testid="dexter-submit">
            Scan
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="dexter-open-modal"
            onClick={() => setIsModalOpen(true)}
          >
            Search
          </Button>
        </form>
        {parseError && !isModalOpen && (
          <div
            data-testid="dexter-parse-error"
            className="text-sm text-red-400 mt-2"
          >
            Usage: /x &lt;chain&gt; &lt;address&gt; or /c &lt;chain&gt;
            &lt;address&gt; — or paste a bare contract address (0x… for EVM,
            base58 for Solana).
          </div>
        )}
        {scan && !isModalOpen && <ScanResultView scan={scan} />}
        {!scan && !parseError && !isModalOpen && (
          <div
            data-testid="dexter-idle"
            className="text-sm text-slate-500 mt-2"
          >
            Dexter lookup runs on market-data HTTP — no bot token needed.
          </div>
        )}
      </Card>
      <ScanSearchModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        scan={scan}
        parseError={parseError}
        recent={recent}
        onSubmit={runSearch}
        onSelectRecent={runSearch}
        onClearRecent={clearRecent}
      />
    </div>
  );
}

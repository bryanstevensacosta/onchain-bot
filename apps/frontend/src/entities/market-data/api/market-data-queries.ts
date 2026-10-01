import { httpGet, httpPost } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type {
  AddressSnapshotView,
  BatchSnapshotsResponse,
  ChainInfoView,
  DetectChainView,
  MarketDataSnapshotView,
  ProviderStatusView,
} from '../model/types';

export const marketDataKeys = {
  all: ['market-data'] as const,
  chains: () => [...marketDataKeys.all, 'chains'] as const,
  chain: (id: string) => [...marketDataKeys.all, 'chain', id] as const,
  detect: (address: string) =>
    [...marketDataKeys.all, 'detect', address] as const,
  providers: () => [...marketDataKeys.all, 'providers'] as const,
  address: (chain: string, address: string, kind?: string) =>
    [...marketDataKeys.all, 'address', chain, address, kind ?? ''] as const,
  compat: (chain: string, address: string) =>
    [...marketDataKeys.all, 'compat', chain, address] as const,
};

export async function fetchChains(): Promise<ReadonlyArray<ChainInfoView>> {
  return httpGet<ReadonlyArray<ChainInfoView>>(ENDPOINTS.marketData.chains);
}

export async function fetchChainById(id: string): Promise<ChainInfoView> {
  return httpGet<ChainInfoView>(ENDPOINTS.marketData.chain(id));
}

export async function fetchDetectChain(
  address: string,
): Promise<DetectChainView> {
  return httpGet<DetectChainView>(ENDPOINTS.marketData.detect(address));
}

export async function fetchProviders(): Promise<
  ReadonlyArray<ProviderStatusView>
> {
  return httpGet<ReadonlyArray<ProviderStatusView>>(
    ENDPOINTS.marketData.providers,
  );
}

export async function fetchAddressSnapshot(
  chain: string,
  address: string,
  kind?: string,
): Promise<AddressSnapshotView> {
  return httpGet<AddressSnapshotView>(
    ENDPOINTS.marketData.address(chain, address, kind),
  );
}

export async function fetchCompatSnapshot(
  chain: string,
  address: string,
): Promise<MarketDataSnapshotView> {
  return httpGet<MarketDataSnapshotView>(
    ENDPOINTS.marketData.compatSnapshot(chain, address),
  );
}

export async function fetchBatchSnapshots(
  items: ReadonlyArray<{ chain: string; address: string; kind?: string }>,
): Promise<BatchSnapshotsResponse> {
  return httpPost<{ items: typeof items }, BatchSnapshotsResponse>(
    ENDPOINTS.marketData.batch(),
    { items },
  );
}

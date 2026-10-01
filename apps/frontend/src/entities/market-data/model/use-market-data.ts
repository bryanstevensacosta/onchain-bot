import { useQuery } from '@tanstack/react-query';
import {
  fetchAddressSnapshot,
  fetchChains,
  fetchCompatSnapshot,
  fetchDetectChain,
  fetchProviders,
  marketDataKeys,
} from '../api/market-data-queries';

export function useMarketChains() {
  return useQuery({
    queryKey: marketDataKeys.chains(),
    queryFn: fetchChains,
    refetchInterval: 30_000,
  });
}

export function useMarketProviders() {
  return useQuery({
    queryKey: marketDataKeys.providers(),
    queryFn: fetchProviders,
    refetchInterval: 15_000,
  });
}

export function useDetectChain(address: string | null) {
  return useQuery({
    queryKey: marketDataKeys.detect(address ?? ''),
    queryFn: () => fetchDetectChain(address as string),
    enabled: !!address,
    retry: 1,
  });
}

export function useAddressSnapshot(
  chain: string | null,
  address: string | null,
  kind?: string,
) {
  return useQuery({
    queryKey: marketDataKeys.address(chain ?? '', address ?? '', kind),
    queryFn: () =>
      fetchAddressSnapshot(chain as string, address as string, kind),
    enabled: !!chain && !!address,
    retry: 1,
  });
}

export function useCompatSnapshot(
  chain: string | null,
  address: string | null,
) {
  return useQuery({
    queryKey: marketDataKeys.compat(chain ?? '', address ?? ''),
    queryFn: () => fetchCompatSnapshot(chain as string, address as string),
    enabled: !!chain && !!address,
    retry: 1,
  });
}

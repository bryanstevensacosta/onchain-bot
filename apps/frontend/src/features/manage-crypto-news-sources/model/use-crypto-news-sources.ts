import { useQuery } from '@tanstack/react-query';
import { listCryptoNewsSources } from '../api/list-crypto-news-sources-client';

export function useCryptoNewsSources() {
  return useQuery({
    queryKey: ['crypto-news', 'sources'],
    queryFn: listCryptoNewsSources,
    staleTime: 30_000,
  });
}

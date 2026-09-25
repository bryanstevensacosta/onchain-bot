import { useQuery } from '@tanstack/react-query';
import { cryptoNewsKeys } from '@/entities/crypto-news';
import { listCryptoNewsSources } from '../api/list-crypto-news-sources-client';

export function useCryptoNewsSources() {
  return useQuery({
    queryKey: cryptoNewsKeys.sources(),
    queryFn: listCryptoNewsSources,
    staleTime: 30_000,
  });
}

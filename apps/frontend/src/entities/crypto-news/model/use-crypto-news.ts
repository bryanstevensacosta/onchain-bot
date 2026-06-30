import { useQuery } from '@tanstack/react-query';
import {
  cryptoNewsKeys,
  fetchCryptoNewsMessages,
  fetchCryptoNewsSources,
  type CryptoNewsMessage,
  type CryptoNewsSource,
} from '@/entities/crypto-news/api/crypto-news-queries';

export function useCryptoNewsMessages(
  limit = 50,
  channelId?: string,
) {
  return useQuery<ReadonlyArray<CryptoNewsMessage>>({
    queryKey: cryptoNewsKeys.messages(limit, channelId),
    queryFn: () => fetchCryptoNewsMessages(limit, channelId),
    refetchInterval: 15_000,
  });
}

export function useCryptoNewsSources() {
  return useQuery<ReadonlyArray<CryptoNewsSource>>({
    queryKey: cryptoNewsKeys.sources(),
    queryFn: () => fetchCryptoNewsSources(),
    refetchInterval: 30_000,
  });
}

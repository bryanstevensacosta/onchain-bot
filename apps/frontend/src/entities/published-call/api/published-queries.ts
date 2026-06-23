import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { PublishedCallView } from '../model/types';

export const publishedKeys = {
  all: ['published'] as const,
  published: (limit = 30) => [...publishedKeys.all, 'list', limit] as const,
  failed: (limit = 30) => [...publishedKeys.all, 'failed', limit] as const,
  byToken: (chain: string, address: string) =>
    [...publishedKeys.all, chain, address] as const,
};

export async function fetchPublished(
  limit = 30,
): Promise<ReadonlyArray<PublishedCallView>> {
  return httpGet<ReadonlyArray<PublishedCallView>>(
    `${ENDPOINTS.publishing.published}?limit=${limit}`,
  );
}

export async function fetchFailed(
  limit = 30,
): Promise<ReadonlyArray<PublishedCallView>> {
  return httpGet<ReadonlyArray<PublishedCallView>>(
    `${ENDPOINTS.publishing.failed}?limit=${limit}`,
  );
}

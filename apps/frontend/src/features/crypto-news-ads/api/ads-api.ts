import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';

/**
 * View models for the crypto-news-ads REST API (mirrors the backend
 * `AdView` / `RotationConfigView` mappers in
 * `apps/backend/src/telegram/crypto-news-ads/application/mappers/ads.mapper.ts`).
 */

export interface AdView {
  readonly id: string;
  readonly name: string;
  readonly body: string;
  readonly imagePath: string | null;
  readonly enabled: boolean;
  readonly order: number;
  readonly timesPublished: number;
  readonly consecutiveFailures: number;
  readonly lastPublishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RotationConfigView {
  readonly enabled: boolean;
  readonly everyNPosts: number;
  readonly minMinutesBetweenAds: number;
}

export interface CreateAdBody {
  readonly name: string;
  readonly body: string;
  readonly imagePath?: string;
}

export type UpdateAdBody = Partial<{
  name: string;
  body: string;
  imagePath: string | null;
  enabled: boolean;
  order: number;
}>;

export type UpdateRotationConfigBody = Partial<RotationConfigView>;

export const adsKeys = {
  all: ['crypto-news-ads'] as const,
  list: () => [...adsKeys.all, 'ads', 'list'] as const,
  config: () => [...adsKeys.all, 'rotation-config'] as const,
};

export async function fetchAds(): Promise<ReadonlyArray<AdView>> {
  return httpGet<ReadonlyArray<AdView>>('/crypto-news-ads/ads');
}

export async function createAd(body: CreateAdBody): Promise<AdView> {
  return httpPost<CreateAdBody, AdView>('/crypto-news-ads/ads', body);
}

export async function updateAd(
  id: string,
  body: UpdateAdBody,
): Promise<AdView> {
  return httpPatch<UpdateAdBody, AdView>(
    `/crypto-news-ads/ads/${encodeURIComponent(id)}`,
    body,
  );
}

export async function deleteAd(id: string): Promise<void> {
  await httpDelete<void>(`/crypto-news-ads/ads/${encodeURIComponent(id)}`);
}

export async function fetchRotationConfig(): Promise<RotationConfigView> {
  return httpGet<RotationConfigView>('/crypto-news-ads/rotation-config');
}

export async function updateRotationConfig(
  body: UpdateRotationConfigBody,
): Promise<RotationConfigView> {
  return httpPatch<UpdateRotationConfigBody, RotationConfigView>(
    '/crypto-news-ads/rotation-config',
    body,
  );
}

import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
  httpPostForm,
} from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';

/**
 * View models for the feed-scheduling REST API (Tramo 2, todo 9:
 * served by feed-publisher `GET /feed-api/api/scheduling/*`,
 * `:3040` dev / `:3041` staging / `:3042` prod — P36 scheduling
 * naming, not ads).
 */

export type SchedulingFormat = 'text' | 'photo' | 'video' | 'album';

/**
 * One operator-configured inline keyboard button for a scheduling. Scheduling publish
 * WITHOUT a keyboard unless at least one fully-filled button is persisted
 * (`scheduling.buttons`).
 */
export type SchedulingButton = {
  readonly text: string;
  readonly url: string;
};

export interface SchedulingView {
  readonly id: string;
  readonly name: string;
  readonly body: string;
  readonly buttons: Array<SchedulingButton> | null;
  readonly imageMediaId: string | null;
  readonly format: SchedulingFormat;
  readonly videoMediaId: string | null;
  readonly albumMediaIds: string[] | null;
  readonly enabled: boolean;
  readonly order: number;
  readonly timesPublished: number;
  readonly consecutiveFailures: number;
  readonly lastPublishedAt: string | null;
  readonly expiresAt: string | null;
  readonly expirationAction: 'disable' | 'delete';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SchedulingTargetLimitsView {
  readonly publishDelayMs: number;
  readonly dailyCap: number;
}

export interface RotationConfigView {
  readonly enabled: boolean;
  readonly everyNPosts: number;
  readonly minMinutesBetweenAds: number;
  readonly telegram?: SchedulingTargetLimitsView;
  readonly threads?: SchedulingTargetLimitsView;
}

export interface MediaLibraryView {
  readonly id: string;
  readonly url: string;
  readonly originalFileName: string | null;
  readonly mimeType: string | null;
  readonly fileSize: number | null;
  readonly createdAt: string;
}

export interface CreateSchedulingBody {
  readonly name: string;
  readonly body: string;
  readonly format?: SchedulingFormat;
  readonly videoMediaId?: string | null;
  readonly albumMediaIds?: string[];
  readonly buttons?: Array<SchedulingButton>;
  readonly expiresAt?: string;
  readonly expirationAction?: 'disable' | 'delete';
}

export type UpdateSchedulingBody = Partial<{
  name: string;
  body: string;
  format: SchedulingFormat;
  videoMediaId: string | null;
  albumMediaIds: string[];
  buttons: Array<SchedulingButton> | null;
  enabled: boolean;
  order: number;
  expiresAt: string | null;
  expirationAction: 'disable' | 'delete';
}>;

export type UpdateRotationConfigBody = Partial<RotationConfigView>;

export const schedulingKeys = {
  all: ['feed-scheduling'] as const,
  list: () => [...schedulingKeys.all, 'scheduling', 'list'] as const,
  config: () => [...schedulingKeys.all, 'rotation-config'] as const,
  mediaLibrary: () => [...schedulingKeys.all, 'media-library'] as const,
};

export async function fetchScheduling(): Promise<
  ReadonlyArray<SchedulingView>
> {
  return httpGet<ReadonlyArray<SchedulingView>>(
    ENDPOINTS.feedPublisher.scheduling.ads(),
  );
}

export async function fetchMediaLibrary(): Promise<
  ReadonlyArray<MediaLibraryView>
> {
  return httpGet<ReadonlyArray<MediaLibraryView>>(
    ENDPOINTS.feedPublisher.scheduling.mediaLibrary(),
  );
}

export async function createScheduling(
  body: CreateSchedulingBody,
): Promise<SchedulingView> {
  return httpPost<CreateSchedulingBody, SchedulingView>(
    ENDPOINTS.feedPublisher.scheduling.ads(),
    body,
  );
}

export async function updateScheduling(
  id: string,
  body: UpdateSchedulingBody,
): Promise<SchedulingView> {
  return httpPatch<UpdateSchedulingBody, SchedulingView>(
    ENDPOINTS.feedPublisher.scheduling.ad(id),
    body,
  );
}

export async function deleteScheduling(id: string): Promise<void> {
  await httpDelete<void>(ENDPOINTS.feedPublisher.scheduling.ad(id));
}

export async function uploadSchedulingImage(
  schedulingId: string,
  file: File,
): Promise<SchedulingView> {
  const form = new FormData();
  form.append('file', file);
  return httpPostForm<SchedulingView>(
    ENDPOINTS.feedPublisher.scheduling.adImage(schedulingId),
    form,
  );
}

export async function clearSchedulingImage(
  schedulingId: string,
): Promise<SchedulingView> {
  return httpDelete<SchedulingView>(
    ENDPOINTS.feedPublisher.scheduling.adImage(schedulingId),
  );
}

export async function uploadSchedulingVideo(
  schedulingId: string,
  file: File,
): Promise<SchedulingView> {
  const form = new FormData();
  form.append('file', file);
  return httpPostForm<SchedulingView>(
    ENDPOINTS.feedPublisher.scheduling.adVideo(schedulingId),
    form,
  );
}

export async function clearSchedulingVideo(
  schedulingId: string,
): Promise<SchedulingView> {
  return httpDelete<SchedulingView>(
    ENDPOINTS.feedPublisher.scheduling.adVideo(schedulingId),
  );
}

export function schedulingImageUrl(mediaId: string): string {
  return ENDPOINTS.feedPublisher.scheduling.media(mediaId);
}

export function schedulingVideoUrl(mediaId: string): string {
  return ENDPOINTS.feedPublisher.scheduling.media(mediaId);
}

export async function reuseLibraryImage(
  schedulingId: string,
  libraryMediaId: string,
): Promise<SchedulingView> {
  return httpPost<{ libraryMediaIds: string[] }, SchedulingView>(
    ENDPOINTS.feedPublisher.scheduling.adReuseLibraryMedia(schedulingId),
    { libraryMediaIds: [libraryMediaId] },
  );
}

export async function reuseLibraryImages(
  schedulingId: string,
  libraryMediaIds: string[],
): Promise<SchedulingView> {
  return httpPost<{ libraryMediaIds: string[] }, SchedulingView>(
    ENDPOINTS.feedPublisher.scheduling.adReuseLibraryMedia(schedulingId),
    { libraryMediaIds },
  );
}

export interface PublishAdNowResult {
  readonly ok: boolean;
  readonly messageId: number | null;
  readonly error: string | null;
}

export async function publishSchedulingNow(
  id: string,
  target: 'telegram' | 'threads' = 'telegram',
): Promise<PublishAdNowResult> {
  return httpPost<{ target: string }, PublishAdNowResult>(
    ENDPOINTS.feedPublisher.scheduling.adPublishNow(id),
    { target },
  );
}

export function libraryImageUrl(libraryMediaId: string): string {
  return ENDPOINTS.feedPublisher.scheduling.libraryMedia(libraryMediaId);
}

export async function fetchRotationConfig(): Promise<RotationConfigView> {
  return httpGet<RotationConfigView>(
    ENDPOINTS.feedPublisher.scheduling.rotationConfig(),
  );
}

export async function updateRotationConfig(
  body: UpdateRotationConfigBody,
): Promise<RotationConfigView> {
  return httpPatch<UpdateRotationConfigBody, RotationConfigView>(
    ENDPOINTS.feedPublisher.scheduling.rotationConfig(),
    body,
  );
}

import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
  httpPostForm,
} from '@/shared/api/http-client';

/**
 * View models for the feed-scheduling REST API (mirrors the backend
 * `SchedulingView` / `RotationConfigView` mappers; the backend ads module
 * dies at cutover and is replaced by the scheduling controllers serving
 * `/crypto-news-scheduling/*`).
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

export interface RotationConfigView {
  readonly enabled: boolean;
  readonly everyNPosts: number;
  readonly minMinutesBetweenScheduling: number;
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
    '/crypto-news-scheduling/scheduling',
  );
}

export async function fetchMediaLibrary(): Promise<
  ReadonlyArray<MediaLibraryView>
> {
  return httpGet<ReadonlyArray<MediaLibraryView>>(
    '/crypto-news-scheduling/media-library',
  );
}

export async function createScheduling(
  body: CreateSchedulingBody,
): Promise<SchedulingView> {
  return httpPost<CreateSchedulingBody, SchedulingView>(
    '/crypto-news-scheduling/scheduling',
    body,
  );
}

export async function updateScheduling(
  id: string,
  body: UpdateSchedulingBody,
): Promise<SchedulingView> {
  return httpPatch<UpdateSchedulingBody, SchedulingView>(
    `/crypto-news-scheduling/scheduling/${encodeURIComponent(id)}`,
    body,
  );
}

export async function deleteScheduling(id: string): Promise<void> {
  await httpDelete<void>(
    `/crypto-news-scheduling/scheduling/${encodeURIComponent(id)}`,
  );
}

export async function uploadSchedulingImage(
  schedulingId: string,
  file: File,
): Promise<SchedulingView> {
  const form = new FormData();
  form.append('file', file);
  return httpPostForm<SchedulingView>(
    `/crypto-news-scheduling/scheduling/${encodeURIComponent(schedulingId)}/image`,
    form,
  );
}

export async function clearSchedulingImage(
  schedulingId: string,
): Promise<SchedulingView> {
  return httpDelete<SchedulingView>(
    `/crypto-news-scheduling/scheduling/${encodeURIComponent(schedulingId)}/image`,
  );
}

export async function uploadSchedulingVideo(
  schedulingId: string,
  file: File,
): Promise<SchedulingView> {
  const form = new FormData();
  form.append('file', file);
  return httpPostForm<SchedulingView>(
    `/crypto-news-scheduling/scheduling/${encodeURIComponent(schedulingId)}/video`,
    form,
  );
}

export async function clearSchedulingVideo(
  schedulingId: string,
): Promise<SchedulingView> {
  return httpDelete<SchedulingView>(
    `/crypto-news-scheduling/scheduling/${encodeURIComponent(schedulingId)}/video`,
  );
}

export function schedulingImageUrl(mediaId: string): string {
  return `/crypto-news-scheduling/media/${encodeURIComponent(mediaId)}`;
}

export function schedulingVideoUrl(mediaId: string): string {
  return `/crypto-news-scheduling/media/${encodeURIComponent(mediaId)}`;
}

export async function reuseLibraryImage(
  schedulingId: string,
  libraryMediaId: string,
): Promise<SchedulingView> {
  return httpPost<{ libraryMediaId: string }, SchedulingView>(
    `/crypto-news-scheduling/scheduling/${encodeURIComponent(schedulingId)}/reuse-image`,
    { libraryMediaId },
  );
}

export async function reuseLibraryImages(
  schedulingId: string,
  libraryMediaIds: string[],
): Promise<SchedulingView> {
  return httpPost<{ libraryMediaIds: string[] }, SchedulingView>(
    `/crypto-news-scheduling/scheduling/${encodeURIComponent(schedulingId)}/reuse-library-images`,
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
): Promise<PublishAdNowResult> {
  return httpPost<object, PublishAdNowResult>(
    `/crypto-news-scheduling/scheduling/${encodeURIComponent(id)}/publish-now`,
    {},
  );
}

export function libraryImageUrl(libraryMediaId: string): string {
  return `/crypto-news-scheduling/media-library/${encodeURIComponent(libraryMediaId)}`;
}

export async function fetchRotationConfig(): Promise<RotationConfigView> {
  return httpGet<RotationConfigView>('/crypto-news-scheduling/rotation-config');
}

export async function updateRotationConfig(
  body: UpdateRotationConfigBody,
): Promise<RotationConfigView> {
  return httpPatch<UpdateRotationConfigBody, RotationConfigView>(
    '/crypto-news-scheduling/rotation-config',
    body,
  );
}

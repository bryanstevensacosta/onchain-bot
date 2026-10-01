import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';

/**
 * Feed-session views (Tramo 2, todo 16; renamed from publishing-profile).
 *
 * Feed sessions ARE feed-publisher sessions (one tab = one session, P34):
 * `PublishingSessionView` mirrored verbatim from
 * `apps/feed-publisher/src/sessions/`. Feed templates are starting points
 * (creation-time snapshot, later edits do NOT rewrite live sessions).
 * All paths go through the same-origin `/feed-api` prefix (vite dev
 * proxies it to `:3040`; staging `:3041`, prod `:3042`).
 *
 * History: this slice was `entities/profile` (`ProfileView`,
 * `profileKeys`, `fetchProfiles`, …). Those names remain as
 * `@deprecated` aliases below during transition.
 */

export interface FeedSessionTarget {
  readonly botId: string;
  readonly chatId: string;
}

export interface FeedSessionView {
  readonly id: string;
  readonly name: string;
  readonly templateId: string | null;
  readonly active: boolean;
  readonly matchingEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly llmEnabled: boolean;
  readonly keywordIds: ReadonlyArray<string>;
  readonly sourceToggles: Record<string, boolean>;
  readonly telegramTargets: ReadonlyArray<FeedSessionTarget>;
  readonly threadsTargets: ReadonlyArray<FeedSessionTarget>;
  readonly canConsume: boolean;
  readonly canPublish: boolean;
}

export interface FeedTemplateBinding {
  readonly botId: string;
  readonly target: string;
  readonly chatId: string;
}

export interface FeedTemplateView {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly sourceIds: ReadonlyArray<string>;
  readonly keywordIds: ReadonlyArray<string>;
  readonly promptTemplateId: string | null;
  readonly targets: ReadonlyArray<string>;
  readonly botBindings: ReadonlyArray<FeedTemplateBinding>;
  readonly matchingEnabled: boolean;
  readonly llmEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly scheduleMode: string;
  readonly canPublish: boolean;
}

export interface CreateFeedSessionBody {
  id?: string;
  name: string;
  templateId?: string | null;
  sourceToggles?: Record<string, boolean>;
  keywordIds?: string[];
  matchingEnabled?: boolean;
  publishingEnabled?: boolean;
  llmEnabled?: boolean;
  telegramTargets?: FeedSessionTarget[];
  threadsTargets?: string[];
  active?: boolean;
}

export interface UpdateFeedSessionBody {
  name?: string;
  templateId?: string | null;
  sourceToggles?: Record<string, boolean>;
  keywordIds?: string[];
  matchingEnabled?: boolean;
  publishingEnabled?: boolean;
  llmEnabled?: boolean;
  telegramTargets?: FeedSessionTarget[];
  threadsTargets?: FeedSessionTarget[];
  active?: boolean;
}

/** Badge contract mirrored from `message-match.views.ts` (todos 17/18). */
export type MessageBadge =
  | 'Not matched'
  | 'Pending to publish'
  | 'Published'
  | 'Failed'
  | 'Not found'
  | `Blocked by ${string}`;

export interface KeywordHitView {
  readonly id: string;
  readonly phrase: string;
}

export interface BlacklistHitView {
  readonly id: string;
  readonly phrase: string;
}

export interface MessageQueueStatusView {
  readonly status: string;
  readonly attempts: number;
  readonly blockedReason: string | null;
  readonly lastError: string | null;
  readonly telegramMessageId: string | null;
}

export interface MessageStatusView {
  readonly channelId: string;
  readonly messageId: number;
  readonly ingested: boolean;
  readonly matched: boolean;
  readonly blocked: boolean;
  readonly matchedKeywords: ReadonlyArray<KeywordHitView>;
  readonly blockedBy: ReadonlyArray<BlacklistHitView>;
  readonly reasons: ReadonlyArray<string>;
  readonly filteredTitle: string | null;
  readonly filteredContent: string | null;
  readonly rawTitle: string | null;
  readonly rawContent: string | null;
  readonly queue: MessageQueueStatusView | null;
  readonly badge: MessageBadge;
}

export interface FilterPreviewStepView {
  readonly filterId: string;
  readonly priority: number;
  readonly pattern: string;
  readonly replacement: string;
  readonly flags: string;
  readonly isActive: boolean;
  readonly applied: boolean;
  readonly skippedReason: string | null;
  readonly titleAfter: string | null;
  readonly contentAfter: string;
}

export interface FilterPreviewView {
  readonly channelId: string;
  readonly rawTitle: string | null;
  readonly rawContent: string;
  readonly filteredTitle: string | null;
  readonly filteredContent: string;
  readonly filtersApplied: number;
  readonly filtersTotal: number;
  readonly steps: ReadonlyArray<FilterPreviewStepView>;
}

export interface PublisherKeywordView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly templateId: string | null;
  readonly matchMode: string;
  readonly createdAt: string;
}

export interface PublisherBlacklistView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly matchMode: string;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly createdAt: string;
}

export interface FeedSessionContentFilterView {
  readonly id: string;
  readonly channelId: string;
  readonly pattern: string;
  readonly replacement: string;
  readonly flags: string;
  readonly priority: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FeedSessionQueueEntryView {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly status: string;
  readonly attempts: number;
  readonly blockedReason: string | null;
  readonly lastError: string | null;
  readonly telegramMessageId: string | null;
}

export interface FeedSessionLlmConfigView {
  readonly defaultTemplateId: string;
  readonly targetChannel: string;
  readonly llmEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly rejectNonLatin: boolean;
  readonly dailyCap: number;
  readonly dailyResetUtcHour: number;
  readonly randomDelayMinMs: number;
  readonly randomDelayMaxMs: number;
  readonly llmMaxAttempts: number;
  readonly updatedAt: string;
}

export interface FeedSessionPipelineFlagsView {
  readonly flags: {
    readonly matching: boolean;
    readonly llm: boolean;
    readonly publishing: boolean;
  };
  readonly llmActive: boolean;
  readonly mode: string;
}

export const feedSessionKeys = {
  all: ['feed-sessions'] as const,
  list: () => [...feedSessionKeys.all, 'list'] as const,
  detail: (id: string) => [...feedSessionKeys.all, 'detail', id] as const,
  templates: () => [...feedSessionKeys.all, 'templates'] as const,
  status: (channelId: string, messageId: number) =>
    [...feedSessionKeys.all, 'status', channelId, messageId] as const,
  publisherKeywords: () =>
    [...feedSessionKeys.all, 'publisher-keywords'] as const,
  publisherBlacklist: () =>
    [...feedSessionKeys.all, 'publisher-blacklist'] as const,
  channelFilters: (channelId: string) =>
    [...feedSessionKeys.all, 'channel-filters', channelId] as const,
  queue: () => [...feedSessionKeys.all, 'queue'] as const,
  llm: () => [...feedSessionKeys.all, 'llm'] as const,
};

export async function fetchFeedSessions(): Promise<
  ReadonlyArray<FeedSessionView>
> {
  return httpGet<ReadonlyArray<FeedSessionView>>(
    ENDPOINTS.feedPublisher.sessions.list(),
  );
}

export async function fetchFeedSession(id: string): Promise<FeedSessionView> {
  return httpGet<FeedSessionView>(ENDPOINTS.feedPublisher.sessions.detail(id));
}

export async function createFeedSession(
  body: CreateFeedSessionBody,
): Promise<FeedSessionView> {
  return httpPost<CreateFeedSessionBody, FeedSessionView>(
    ENDPOINTS.feedPublisher.sessions.list(),
    body,
  );
}

export async function updateFeedSession(
  id: string,
  body: UpdateFeedSessionBody,
): Promise<FeedSessionView> {
  return httpPatch<UpdateFeedSessionBody, FeedSessionView>(
    ENDPOINTS.feedPublisher.sessions.detail(id),
    body,
  );
}

export async function activateFeedSession(
  id: string,
): Promise<FeedSessionView> {
  return httpPatch<Record<string, never>, FeedSessionView>(
    ENDPOINTS.feedPublisher.sessions.activate(id),
    {},
  );
}

export async function deactivateFeedSession(
  id: string,
): Promise<FeedSessionView> {
  return httpPatch<Record<string, never>, FeedSessionView>(
    ENDPOINTS.feedPublisher.sessions.deactivate(id),
    {},
  );
}

export async function toggleFeedSessionSource(
  id: string,
  sourceId: string,
  enabled: boolean,
): Promise<FeedSessionView> {
  return httpPatch<{ sourceId: string; enabled: boolean }, FeedSessionView>(
    ENDPOINTS.feedPublisher.sessions.sources(id),
    { sourceId, enabled },
  );
}

export async function deleteFeedSession(id: string): Promise<void> {
  await httpDelete<void>(ENDPOINTS.feedPublisher.sessions.detail(id));
}

export async function fetchFeedTemplates(): Promise<
  ReadonlyArray<FeedTemplateView>
> {
  return httpGet<ReadonlyArray<FeedTemplateView>>(
    ENDPOINTS.feedPublisher.templates.list(),
  );
}

export interface CreateFeedTemplateBody {
  id?: string;
  name: string;
  sourceIds?: ReadonlyArray<string>;
  keywordIds?: ReadonlyArray<string>;
  promptTemplateId?: string | null;
  targets: ReadonlyArray<'telegram' | 'threads'>;
  botBindings?: ReadonlyArray<FeedTemplateBinding>;
  matchingEnabled?: boolean;
  llmEnabled?: boolean;
  publishingEnabled?: boolean;
}

export interface UpdateFeedTemplateBody {
  sourceIds?: ReadonlyArray<string>;
  keywordIds?: ReadonlyArray<string>;
  promptTemplateId?: string | null;
  targets?: ReadonlyArray<'telegram' | 'threads'>;
  botBindings?: ReadonlyArray<FeedTemplateBinding>;
  matchingEnabled?: boolean;
  llmEnabled?: boolean;
  publishingEnabled?: boolean;
  active?: boolean;
}

export async function createFeedTemplate(
  body: CreateFeedTemplateBody,
): Promise<FeedTemplateView> {
  return httpPost<CreateFeedTemplateBody, FeedTemplateView>(
    ENDPOINTS.feedPublisher.templates.list(),
    body,
  );
}

export async function updateFeedTemplate(
  id: string,
  body: UpdateFeedTemplateBody,
): Promise<FeedTemplateView> {
  return httpPatch<UpdateFeedTemplateBody, FeedTemplateView>(
    ENDPOINTS.feedPublisher.templates.detail(id),
    body,
  );
}

export async function deleteFeedTemplate(id: string): Promise<void> {
  await httpDelete<void>(ENDPOINTS.feedPublisher.templates.detail(id));
}

export async function fetchMessageStatus(
  channelId: string,
  messageId: number,
): Promise<MessageStatusView> {
  return httpGet<MessageStatusView>(
    ENDPOINTS.feedPublisher.matching.messageStatus(channelId, messageId),
  );
}

export async function fetchPublisherKeywords(): Promise<
  ReadonlyArray<PublisherKeywordView>
> {
  return httpGet<ReadonlyArray<PublisherKeywordView>>(
    ENDPOINTS.feedPublisher.keywords.list(),
  );
}

export async function fetchPublisherBlacklist(): Promise<
  ReadonlyArray<PublisherBlacklistView>
> {
  return httpGet<ReadonlyArray<PublisherBlacklistView>>(
    ENDPOINTS.feedPublisher.blacklist.list(),
  );
}

export async function fetchChannelFilters(
  channelId: string,
): Promise<ReadonlyArray<FeedSessionContentFilterView>> {
  return httpGet<ReadonlyArray<FeedSessionContentFilterView>>(
    ENDPOINTS.feedPublisher.profileFilters.list(channelId),
  );
}

export async function toggleChannelFilter(
  id: string,
): Promise<FeedSessionContentFilterView> {
  return httpPatch<Record<string, never>, FeedSessionContentFilterView>(
    ENDPOINTS.feedPublisher.profileFilters.toggle(id),
    {},
  );
}

export async function previewChannelFilters(
  channelId: string,
  title: string | null,
  content: string,
): Promise<FilterPreviewView> {
  return httpPost<{ title: string | null; content: string }, FilterPreviewView>(
    ENDPOINTS.feedPublisher.profileFilters.preview(channelId),
    { title, content },
  );
}

export async function fetchFeedSessionQueue(
  limit = 50,
): Promise<ReadonlyArray<FeedSessionQueueEntryView>> {
  return httpGet<ReadonlyArray<FeedSessionQueueEntryView>>(
    `${ENDPOINTS.feedPublisher.queueList()}?limit=${limit}`,
  );
}

export async function fetchFeedSessionLlmConfig(): Promise<FeedSessionLlmConfigView> {
  return httpGet<FeedSessionLlmConfigView>(
    ENDPOINTS.feedPublisher.llm.config(),
  );
}

export async function fetchFeedSessionPipelineFlags(): Promise<FeedSessionPipelineFlagsView> {
  return httpGet<FeedSessionPipelineFlagsView>(
    ENDPOINTS.feedPublisher.llm.flags(),
  );
}

/**
 * @deprecated Renamed to `FeedSessionTarget`. Kept as alias during transition.
 */
export type ProfileTarget = FeedSessionTarget;
/**
 * @deprecated Renamed to `FeedSessionView`. Kept as alias during transition.
 */
export type ProfileView = FeedSessionView;
/**
 * @deprecated Renamed to `FeedTemplateBinding`. Kept as alias during transition.
 */
export type ProfileTemplateBinding = FeedTemplateBinding;
/**
 * @deprecated Renamed to `FeedTemplateView`. Kept as alias during transition.
 */
export type ProfileTemplateView = FeedTemplateView;
/**
 * @deprecated Renamed to `CreateFeedSessionBody`. Kept as alias during transition.
 */
export type CreateProfileBody = CreateFeedSessionBody;
/**
 * @deprecated Renamed to `UpdateFeedSessionBody`. Kept as alias during transition.
 */
export type UpdateProfileBody = UpdateFeedSessionBody;
/**
 * @deprecated Renamed to `CreateFeedTemplateBody`. Kept as alias during transition.
 */
export type CreateTemplateBody = CreateFeedTemplateBody;
/**
 * @deprecated Renamed to `UpdateFeedTemplateBody`. Kept as alias during transition.
 */
export type UpdateTemplateBody = UpdateFeedTemplateBody;
/**
 * @deprecated Renamed to `FeedSessionContentFilterView`. Kept as alias during transition.
 */
export type ProfileContentFilterView = FeedSessionContentFilterView;
/**
 * @deprecated Renamed to `FeedSessionQueueEntryView`. Kept as alias during transition.
 */
export type ProfileQueueEntryView = FeedSessionQueueEntryView;
/**
 * @deprecated Renamed to `FeedSessionLlmConfigView`. Kept as alias during transition.
 */
export type ProfileLlmConfigView = FeedSessionLlmConfigView;
/**
 * @deprecated Renamed to `FeedSessionPipelineFlagsView`. Kept as alias during transition.
 */
export type ProfilePipelineFlagsView = FeedSessionPipelineFlagsView;
/**
 * @deprecated Renamed to `feedSessionKeys`. Kept as alias during transition.
 */
export const profileKeys = feedSessionKeys;
/**
 * @deprecated Renamed to `fetchFeedSessions`. Kept as alias during transition.
 */
export const fetchProfiles = fetchFeedSessions;
/**
 * @deprecated Renamed to `fetchFeedSession`. Kept as alias during transition.
 */
export const fetchProfile = fetchFeedSession;
/**
 * @deprecated Renamed to `createFeedSession`. Kept as alias during transition.
 */
export const createProfile = createFeedSession;
/**
 * @deprecated Renamed to `updateFeedSession`. Kept as alias during transition.
 */
export const updateProfile = updateFeedSession;
/**
 * @deprecated Renamed to `activateFeedSession`. Kept as alias during transition.
 */
export const activateProfile = activateFeedSession;
/**
 * @deprecated Renamed to `deactivateFeedSession`. Kept as alias during transition.
 */
export const deactivateProfile = deactivateFeedSession;
/**
 * @deprecated Renamed to `toggleFeedSessionSource`. Kept as alias during transition.
 */
export const toggleProfileSource = toggleFeedSessionSource;
/**
 * @deprecated Renamed to `deleteFeedSession`. Kept as alias during transition.
 */
export const deleteProfile = deleteFeedSession;
/**
 * @deprecated Renamed to `fetchFeedTemplates`. Kept as alias during transition.
 */
export const fetchProfileTemplates = fetchFeedTemplates;
/**
 * @deprecated Renamed to `createFeedTemplate`. Kept as alias during transition.
 */
export const createProfileTemplate = createFeedTemplate;
/**
 * @deprecated Renamed to `updateFeedTemplate`. Kept as alias during transition.
 */
export const updateProfileTemplate = updateFeedTemplate;
/**
 * @deprecated Renamed to `deleteFeedTemplate`. Kept as alias during transition.
 */
export const deleteProfileTemplate = deleteFeedTemplate;
/**
 * @deprecated Renamed to `fetchFeedSessionQueue`. Kept as alias during transition.
 */
export const fetchProfileQueue = fetchFeedSessionQueue;
/**
 * @deprecated Renamed to `fetchFeedSessionLlmConfig`. Kept as alias during transition.
 */
export const fetchProfileLlmConfig = fetchFeedSessionLlmConfig;
/**
 * @deprecated Renamed to `fetchFeedSessionPipelineFlags`. Kept as alias during transition.
 */
export const fetchProfilePipelineFlags = fetchFeedSessionPipelineFlags;

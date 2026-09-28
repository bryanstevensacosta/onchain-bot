import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';

/**
 * Publishing-profile views (Tramo 2, todo 16).
 *
 * Profiles ARE feed-publisher sessions (one tab = one session, P34):
 * `PublishingSessionView` mirrored verbatim from
 * `apps/feed-publisher/src/sessions/`. Templates are starting points
 * (creation-time snapshot, later edits do NOT rewrite live sessions).
 * All paths go through the same-origin `/feed-api` prefix (vite dev
 * proxies it to `:3040`; staging `:3041`, prod `:3042`).
 */

export interface ProfileTarget {
  readonly botId: string;
  readonly chatId: string;
}

export interface ProfileView {
  readonly id: string;
  readonly name: string;
  readonly templateId: string | null;
  readonly active: boolean;
  readonly matchingEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly llmEnabled: boolean;
  readonly keywordIds: ReadonlyArray<string>;
  readonly sourceToggles: Record<string, boolean>;
  readonly telegramTargets: ReadonlyArray<ProfileTarget>;
  readonly threadsTargets: ReadonlyArray<ProfileTarget>;
  readonly canConsume: boolean;
  readonly canPublish: boolean;
}

export interface ProfileTemplateBinding {
  readonly botId: string;
  readonly target: string;
  readonly chatId: string;
}

export interface ProfileTemplateView {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly sourceIds: ReadonlyArray<string>;
  readonly keywordIds: ReadonlyArray<string>;
  readonly promptTemplateId: string | null;
  readonly targets: ReadonlyArray<string>;
  readonly botBindings: ReadonlyArray<ProfileTemplateBinding>;
  readonly matchingEnabled: boolean;
  readonly llmEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly scheduleMode: string;
  readonly canPublish: boolean;
}

export interface CreateProfileBody {
  id?: string;
  name: string;
  templateId?: string | null;
  sourceToggles?: Record<string, boolean>;
  keywordIds?: string[];
  matchingEnabled?: boolean;
  publishingEnabled?: boolean;
  llmEnabled?: boolean;
  telegramTargets?: ProfileTarget[];
  threadsTargets?: string[];
  active?: boolean;
}

export interface UpdateProfileBody {
  templateId?: string | null;
  sourceToggles?: Record<string, boolean>;
  keywordIds?: string[];
  matchingEnabled?: boolean;
  publishingEnabled?: boolean;
  llmEnabled?: boolean;
  telegramTargets?: ProfileTarget[];
  threadsTargets?: ProfileTarget[];
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

export interface ProfileContentFilterView {
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

export interface ProfileQueueEntryView {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly status: string;
  readonly attempts: number;
  readonly blockedReason: string | null;
  readonly lastError: string | null;
  readonly telegramMessageId: string | null;
}

export interface ProfileLlmConfigView {
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

export interface ProfilePipelineFlagsView {
  readonly flags: {
    readonly matching: boolean;
    readonly llm: boolean;
    readonly publishing: boolean;
  };
  readonly llmActive: boolean;
  readonly mode: string;
}

export const profileKeys = {
  all: ['feed-profiles'] as const,
  list: () => [...profileKeys.all, 'list'] as const,
  detail: (id: string) => [...profileKeys.all, 'detail', id] as const,
  templates: () => [...profileKeys.all, 'templates'] as const,
  status: (channelId: string, messageId: number) =>
    [...profileKeys.all, 'status', channelId, messageId] as const,
  publisherKeywords: () => [...profileKeys.all, 'publisher-keywords'] as const,
  publisherBlacklist: () =>
    [...profileKeys.all, 'publisher-blacklist'] as const,
  channelFilters: (channelId: string) =>
    [...profileKeys.all, 'channel-filters', channelId] as const,
  queue: () => [...profileKeys.all, 'queue'] as const,
  llm: () => [...profileKeys.all, 'llm'] as const,
};

export async function fetchProfiles(): Promise<ReadonlyArray<ProfileView>> {
  return httpGet<ReadonlyArray<ProfileView>>(
    ENDPOINTS.feedPublisher.sessions.list(),
  );
}

export async function fetchProfile(id: string): Promise<ProfileView> {
  return httpGet<ProfileView>(ENDPOINTS.feedPublisher.sessions.detail(id));
}

export async function createProfile(
  body: CreateProfileBody,
): Promise<ProfileView> {
  return httpPost<CreateProfileBody, ProfileView>(
    ENDPOINTS.feedPublisher.sessions.list(),
    body,
  );
}

export async function updateProfile(
  id: string,
  body: UpdateProfileBody,
): Promise<ProfileView> {
  return httpPatch<UpdateProfileBody, ProfileView>(
    ENDPOINTS.feedPublisher.sessions.detail(id),
    body,
  );
}

export async function activateProfile(id: string): Promise<ProfileView> {
  return httpPatch<Record<string, never>, ProfileView>(
    ENDPOINTS.feedPublisher.sessions.activate(id),
    {},
  );
}

export async function deactivateProfile(id: string): Promise<ProfileView> {
  return httpPatch<Record<string, never>, ProfileView>(
    ENDPOINTS.feedPublisher.sessions.deactivate(id),
    {},
  );
}

export async function toggleProfileSource(
  id: string,
  sourceId: string,
  enabled: boolean,
): Promise<ProfileView> {
  return httpPatch<{ sourceId: string; enabled: boolean }, ProfileView>(
    ENDPOINTS.feedPublisher.sessions.sources(id),
    { sourceId, enabled },
  );
}

export async function deleteProfile(id: string): Promise<void> {
  await httpDelete<void>(ENDPOINTS.feedPublisher.sessions.detail(id));
}

export async function fetchProfileTemplates(): Promise<
  ReadonlyArray<ProfileTemplateView>
> {
  return httpGet<ReadonlyArray<ProfileTemplateView>>(
    ENDPOINTS.feedPublisher.templates.list(),
  );
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
): Promise<ReadonlyArray<ProfileContentFilterView>> {
  return httpGet<ReadonlyArray<ProfileContentFilterView>>(
    ENDPOINTS.feedPublisher.profileFilters.list(channelId),
  );
}

export async function toggleChannelFilter(
  id: string,
): Promise<ProfileContentFilterView> {
  return httpPatch<Record<string, never>, ProfileContentFilterView>(
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

export async function fetchProfileQueue(
  limit = 50,
): Promise<ReadonlyArray<ProfileQueueEntryView>> {
  return httpGet<ReadonlyArray<ProfileQueueEntryView>>(
    `${ENDPOINTS.feedPublisher.queueList()}?limit=${limit}`,
  );
}

export async function fetchProfileLlmConfig(): Promise<ProfileLlmConfigView> {
  return httpGet<ProfileLlmConfigView>(ENDPOINTS.feedPublisher.llm.config());
}

export async function fetchProfilePipelineFlags(): Promise<ProfilePipelineFlagsView> {
  return httpGet<ProfilePipelineFlagsView>(ENDPOINTS.feedPublisher.llm.flags());
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFeedMessages, fetchFeedSources } from '@/entities/feed';
import type {
  CreateProfileBody,
  FilterPreviewView,
  MessageStatusView,
  ProfileContentFilterView,
  ProfileLlmConfigView,
  ProfilePipelineFlagsView,
  ProfileQueueEntryView,
  ProfileTemplateView,
  ProfileView,
  PublisherBlacklistView,
  PublisherKeywordView,
  UpdateProfileBody,
} from '../api/profile-queries';
import {
  activateProfile,
  createProfile,
  deactivateProfile,
  deleteProfile,
  fetchChannelFilters,
  fetchMessageStatus,
  fetchProfileLlmConfig,
  fetchProfilePipelineFlags,
  fetchProfileQueue,
  fetchProfileTemplates,
  fetchProfiles,
  fetchPublisherBlacklist,
  fetchPublisherKeywords,
  previewChannelFilters,
  profileKeys,
  toggleChannelFilter,
  toggleProfileSource,
  updateProfile,
} from '../api/profile-queries';

export function useProfiles() {
  return useQuery({
    queryKey: profileKeys.list(),
    queryFn: fetchProfiles,
    refetchInterval: 30_000,
  });
}

export function useProfileTemplates() {
  return useQuery({
    queryKey: profileKeys.templates(),
    queryFn: fetchProfileTemplates,
    refetchInterval: 30_000,
  });
}

function useInvalidateProfiles() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: profileKeys.all });
  };
}

export function useCreateProfile() {
  const invalidate = useInvalidateProfiles();
  return useMutation({
    mutationFn: (body: CreateProfileBody) => createProfile(body),
    onSuccess: invalidate,
  });
}

export function useUpdateProfile() {
  const invalidate = useInvalidateProfiles();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProfileBody }) =>
      updateProfile(id, body),
    onSuccess: invalidate,
  });
}

export function useActivateProfile() {
  const invalidate = useInvalidateProfiles();
  return useMutation({
    mutationFn: (id: string) => activateProfile(id),
    onSuccess: invalidate,
  });
}

export function useDeactivateProfile() {
  const invalidate = useInvalidateProfiles();
  return useMutation({
    mutationFn: (id: string) => deactivateProfile(id),
    onSuccess: invalidate,
  });
}

export function useDeleteProfile() {
  const invalidate = useInvalidateProfiles();
  return useMutation({
    mutationFn: (id: string) => deleteProfile(id),
    onSuccess: invalidate,
  });
}

export function useToggleProfileSource() {
  const invalidate = useInvalidateProfiles();
  return useMutation({
    mutationFn: ({
      id,
      sourceId,
      enabled,
    }: {
      id: string;
      sourceId: string;
      enabled: boolean;
    }) => toggleProfileSource(id, sourceId, enabled),
    onSuccess: invalidate,
  });
}

export function useProfileSources() {
  return useQuery({
    queryKey: ['feed-profiles', 'sources'],
    queryFn: () => fetchFeedSources('crypto-news'),
    refetchInterval: 30_000,
  });
}

export function useProfileRecentMessages(limit = 20) {
  return useQuery({
    queryKey: ['feed-profiles', 'recent', limit],
    queryFn: () => fetchFeedMessages(limit, undefined, 'crypto-news'),
    refetchInterval: 15_000,
  });
}

export function useMessageStatus(
  channelId: string,
  messageId: number,
  enabled = true,
) {
  return useQuery({
    queryKey: profileKeys.status(channelId, messageId),
    queryFn: () => fetchMessageStatus(channelId, messageId),
    enabled: enabled && channelId !== '',
    refetchInterval: 15_000,
  });
}

export function usePublisherKeywords() {
  return useQuery({
    queryKey: profileKeys.publisherKeywords(),
    queryFn: fetchPublisherKeywords,
    refetchInterval: 30_000,
  });
}

export function usePublisherBlacklist() {
  return useQuery({
    queryKey: profileKeys.publisherBlacklist(),
    queryFn: fetchPublisherBlacklist,
    refetchInterval: 30_000,
  });
}

export function useProfileQueue(limit = 50) {
  return useQuery({
    queryKey: profileKeys.queue(),
    queryFn: () => fetchProfileQueue(limit),
    refetchInterval: 10_000,
  });
}

export function useChannelFilters(channelId: string | null) {
  return useQuery({
    queryKey: profileKeys.channelFilters(channelId ?? ''),
    queryFn: () => fetchChannelFilters(channelId as string),
    enabled: channelId !== null,
    refetchInterval: 30_000,
  });
}

export function useToggleChannelFilter(channelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => toggleChannelFilter(id),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: profileKeys.channelFilters(channelId),
      });
    },
  });
}

export function useFiltersPreview() {
  return useMutation({
    mutationFn: ({
      channelId,
      title,
      content,
    }: {
      channelId: string;
      title: string | null;
      content: string;
    }) => previewChannelFilters(channelId, title, content),
  });
}

export interface ProfileLlmSection {
  readonly config: ProfileLlmConfigView;
  readonly flags: ProfilePipelineFlagsView;
}

export function useProfileLlm() {
  return useQuery({
    queryKey: profileKeys.llm(),
    queryFn: async (): Promise<ProfileLlmSection> => {
      const [config, flags] = await Promise.all([
        fetchProfileLlmConfig(),
        fetchProfilePipelineFlags(),
      ]);
      return { config, flags };
    },
    refetchInterval: 30_000,
  });
}

export type {
  CreateProfileBody,
  FilterPreviewView,
  MessageStatusView,
  ProfileContentFilterView,
  ProfileQueueEntryView,
  ProfileTemplateView,
  ProfileView,
  PublisherBlacklistView,
  PublisherKeywordView,
  UpdateProfileBody,
};

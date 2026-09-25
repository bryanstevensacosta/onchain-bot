import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  schedulingKeys,
  clearSchedulingImage,
  clearSchedulingVideo,
  createScheduling,
  deleteScheduling,
  fetchScheduling,
  fetchMediaLibrary,
  fetchRotationConfig,
  publishSchedulingNow,
  reuseLibraryImage,
  reuseLibraryImages,
  updateScheduling,
  updateRotationConfig,
  uploadSchedulingImage,
  uploadSchedulingVideo,
  type SchedulingView,
  type CreateSchedulingBody,
  type MediaLibraryView,
  type RotationConfigView,
  type UpdateSchedulingBody,
  type UpdateRotationConfigBody,
} from '@/features/feed-scheduling/api/scheduling-api';

/**
 * Scheduling catalog. Polled every 10s so operator edits in another tab (or the
 * scheduled publisher advancing `timesPublished`) show up without a
 * manual refresh.
 */
export function useScheduling() {
  return useQuery<ReadonlyArray<SchedulingView>>({
    queryKey: schedulingKeys.list(),
    queryFn: fetchScheduling,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useCreateScheduling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSchedulingBody) => createScheduling(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulingKeys.all });
    },
  });
}

export function useUpdateScheduling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSchedulingBody }) =>
      updateScheduling(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulingKeys.all });
    },
  });
}

export function useDeleteScheduling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScheduling(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulingKeys.all });
    },
  });
}

export function usePublishSchedulingNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publishSchedulingNow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulingKeys.all });
    },
  });
}

export function useUploadSchedulingImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      schedulingId,
      file,
    }: {
      schedulingId: string;
      file: File;
    }) => uploadSchedulingImage(schedulingId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulingKeys.all });
      qc.invalidateQueries({ queryKey: schedulingKeys.mediaLibrary() });
    },
  });
}

export function useUploadSchedulingVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      schedulingId,
      file,
    }: {
      schedulingId: string;
      file: File;
    }) => uploadSchedulingVideo(schedulingId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulingKeys.all });
    },
  });
}

/**
 * Media library catalog. Polled every 10s so freshly uploaded images show up
 * in the reuse picker without a manual refresh.
 */
export function useMediaLibrary() {
  return useQuery<ReadonlyArray<MediaLibraryView>>({
    queryKey: schedulingKeys.mediaLibrary(),
    queryFn: fetchMediaLibrary,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useReuseLibraryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      schedulingId,
      libraryMediaId,
    }: {
      schedulingId: string;
      libraryMediaId: string;
    }) => reuseLibraryImage(schedulingId, libraryMediaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulingKeys.all });
      qc.invalidateQueries({ queryKey: schedulingKeys.mediaLibrary() });
    },
  });
}

export function useReuseLibraryImages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      schedulingId,
      libraryMediaIds,
    }: {
      schedulingId: string;
      libraryMediaIds: string[];
    }) => reuseLibraryImages(schedulingId, libraryMediaIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulingKeys.all });
      qc.invalidateQueries({ queryKey: schedulingKeys.mediaLibrary() });
    },
  });
}

export function useClearSchedulingImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (schedulingId: string) => clearSchedulingImage(schedulingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulingKeys.all });
    },
  });
}

export function useClearSchedulingVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (schedulingId: string) => clearSchedulingVideo(schedulingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulingKeys.all });
    },
  });
}

/**
 * Scheduling-rotation schedule. Polled every 10s alongside the scheduling list.
 */
export function useRotationConfig() {
  return useQuery<RotationConfigView>({
    queryKey: schedulingKeys.config(),
    queryFn: fetchRotationConfig,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useUpdateRotationConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateRotationConfigBody) =>
      updateRotationConfig(patch),
    onSuccess: (saved) => {
      qc.setQueryData(schedulingKeys.config(), saved);
      qc.invalidateQueries({ queryKey: schedulingKeys.config() });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adsKeys,
  clearAdImage,
  clearAdVideo,
  createAd,
  deleteAd,
  fetchAds,
  fetchMediaLibrary,
  fetchRotationConfig,
  reuseLibraryImage,
  reuseLibraryImages,
  updateAd,
  updateRotationConfig,
  uploadAdImage,
  uploadAdVideo,
  type AdView,
  type CreateAdBody,
  type MediaLibraryView,
  type RotationConfigView,
  type UpdateAdBody,
  type UpdateRotationConfigBody,
} from '@/features/crypto-news-ads/api/ads-api';

/**
 * Ad catalog. Polled every 10s so operator edits in another tab (or the
 * scheduled publisher advancing `timesPublished`) show up without a
 * manual refresh.
 */
export function useAds() {
  return useQuery<ReadonlyArray<AdView>>({
    queryKey: adsKeys.list(),
    queryFn: fetchAds,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useCreateAd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAdBody) => createAd(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adsKeys.all });
    },
  });
}

export function useUpdateAd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateAdBody }) =>
      updateAd(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adsKeys.all });
    },
  });
}

export function useDeleteAd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAd(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adsKeys.all });
    },
  });
}

export function useUploadAdImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adId, file }: { adId: string; file: File }) =>
      uploadAdImage(adId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adsKeys.all });
      qc.invalidateQueries({ queryKey: adsKeys.mediaLibrary() });
    },
  });
}

export function useUploadAdVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adId, file }: { adId: string; file: File }) =>
      uploadAdVideo(adId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adsKeys.all });
    },
  });
}

/**
 * Media library catalog. Polled every 10s so freshly uploaded images show up
 * in the reuse picker without a manual refresh.
 */
export function useMediaLibrary() {
  return useQuery<ReadonlyArray<MediaLibraryView>>({
    queryKey: adsKeys.mediaLibrary(),
    queryFn: fetchMediaLibrary,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useReuseLibraryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      adId,
      libraryMediaId,
    }: {
      adId: string;
      libraryMediaId: string;
    }) => reuseLibraryImage(adId, libraryMediaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adsKeys.all });
      qc.invalidateQueries({ queryKey: adsKeys.mediaLibrary() });
    },
  });
}

export function useReuseLibraryImages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      adId,
      libraryMediaIds,
    }: {
      adId: string;
      libraryMediaIds: string[];
    }) => reuseLibraryImages(adId, libraryMediaIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adsKeys.all });
      qc.invalidateQueries({ queryKey: adsKeys.mediaLibrary() });
    },
  });
}

export function useClearAdImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (adId: string) => clearAdImage(adId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adsKeys.all });
    },
  });
}

export function useClearAdVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (adId: string) => clearAdVideo(adId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adsKeys.all });
    },
  });
}

/**
 * Ad-rotation schedule. Polled every 10s alongside the ad list.
 */
export function useRotationConfig() {
  return useQuery<RotationConfigView>({
    queryKey: adsKeys.config(),
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
      qc.setQueryData(adsKeys.config(), saved);
      qc.invalidateQueries({ queryKey: adsKeys.config() });
    },
  });
}

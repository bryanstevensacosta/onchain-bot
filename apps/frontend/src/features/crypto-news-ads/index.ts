export { AdsManager } from './ui/ads-manager';
export { AdsRotationConfigForm } from './ui/ads-rotation-config-form';
export {
  useAds,
  useCreateAd,
  useUpdateAd,
  useDeleteAd,
  useMediaLibrary,
  useReuseLibraryImage,
} from './model/use-ads';
export { useRotationConfig, useUpdateRotationConfig } from './model/use-ads';
export type {
  AdView,
  RotationConfigView,
  MediaLibraryView,
  CreateAdBody,
  UpdateAdBody,
  UpdateRotationConfigBody,
} from './api/ads-api';

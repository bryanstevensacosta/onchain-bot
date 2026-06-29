import {
  httpGet,
  httpPost,
  httpPatch,
  httpDelete,
} from '@/shared/api/http-client';
import { SETTINGS_ENDPOINTS } from '@/shared/api/settings-endpoints';

// ---- Filter types ----

export interface SettingsFilter {
  id: string;
  type: string;
  value: string;
  numericValue: number | null;
  scope: 'token' | 'kol' | 'all' | 'global';
  enabled: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSettingsFilterBody {
  value?: string;
  numericValue?: number | null;
  enabled?: boolean;
  scope?: 'token' | 'kol' | 'all' | 'global';
  notes?: string | null;
}

// ---- Preset types ----

export interface SettingsPreset {
  id: string;
  name: string;
  description: string | null;
  snapshot: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface CreatePresetBody {
  name: string;
  description?: string;
  snapshot: Record<string, unknown>;
}

// ---- Filter functions ----

export const settingsFilterKeys = {
  all: ['settings-filters'] as const,
  list: () => [...settingsFilterKeys.all, 'list'] as const,
};

export async function fetchAllFilters(): Promise<
  ReadonlyArray<SettingsFilter>
> {
  return httpGet<ReadonlyArray<SettingsFilter>>(
    SETTINGS_ENDPOINTS.filters.list,
  );
}

export async function updateFilter(
  id: string,
  body: UpdateSettingsFilterBody,
): Promise<SettingsFilter> {
  return httpPatch<UpdateSettingsFilterBody, SettingsFilter>(
    SETTINGS_ENDPOINTS.filters.update(id),
    body,
  );
}

export async function deleteFilter(id: string): Promise<{ deleted: boolean }> {
  return httpDelete<{ deleted: boolean }>(
    SETTINGS_ENDPOINTS.filters.delete(id),
  );
}

// ---- Preset functions ----

export const settingsPresetKeys = {
  all: ['settings-presets'] as const,
  list: () => [...settingsPresetKeys.all, 'list'] as const,
};

export async function fetchAllPresets(): Promise<
  ReadonlyArray<SettingsPreset>
> {
  return httpGet<ReadonlyArray<SettingsPreset>>(
    SETTINGS_ENDPOINTS.presets.list,
  );
}

export async function fetchActivePreset(): Promise<SettingsPreset | null> {
  return httpGet<SettingsPreset | null>(SETTINGS_ENDPOINTS.presets.active);
}

export async function createPreset(
  body: CreatePresetBody,
): Promise<SettingsPreset> {
  return httpPost<CreatePresetBody, SettingsPreset>(
    SETTINGS_ENDPOINTS.presets.create,
    body,
  );
}

export async function applyPreset(id: string): Promise<SettingsPreset> {
  return httpPost<void, SettingsPreset>(
    SETTINGS_ENDPOINTS.presets.apply(id),
    undefined,
  );
}

export async function deletePreset(id: string): Promise<{ deleted: boolean }> {
  return httpDelete<{ deleted: boolean }>(
    SETTINGS_ENDPOINTS.presets.delete(id),
  );
}

export const SETTINGS_ENDPOINTS = {
  filters: {
    list: '/settings/filters',
    byType: (type: string) =>
      `/settings/filters?type=${encodeURIComponent(type)}`,
    update: (id: string) => `/settings/filters/${id}`,
    create: '/settings/filters',
    delete: (id: string) => `/settings/filters/${id}`,
  },
  presets: {
    list: '/settings/presets',
    active: '/settings/presets/active',
    byId: (id: string) => `/settings/presets/${id}`,
    create: '/settings/presets',
    update: (id: string) => `/settings/presets/${id}`,
    delete: (id: string) => `/settings/presets/${id}`,
    apply: (id: string) => `/settings/presets/${id}/apply`,
  },
} as const;

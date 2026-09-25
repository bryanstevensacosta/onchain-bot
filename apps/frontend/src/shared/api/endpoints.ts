import { feedPublisherPath } from './feed-publisher-base';

export const ENDPOINTS = {
  kols: {
    // KOL identity moved to ingestion-telegram (telegram-feed-unification
    // item 8): reads/writes go through the feed API (same /ingestion-api
    // prefix the newsroom uses — vite dev proxies it to :3031, prod nginx
    // rewrites /ingestion-api/* → /api/* on the ingestion host).
    // No single-get route exists in the feed API: detail = list + find.
    // No BLACKLISTED equivalent exists (toggle flips isActive only).
    // No backfill key: POST /telegram-kol/identity/kols/:kolId/backfill
    // answers 501 (identity lives in the feed API, which exposes no
    // backfill equivalent), so no client may call it.
    list: '/ingestion-api/feed/sources?type=kol',
    add: '/ingestion-api/feed/sources',
    toggle: (id: string) =>
      `/ingestion-api/feed/sources/${encodeURIComponent(id)}/toggle`,
  },
  publishing: {
    published: '/vip-calls/calls/published',
    failed: '/vip-calls/calls/failed',
    recent: '/vip-calls/calls/recent',
    publish: '/vip-calls/publish',
  },
  extraction: {
    extract: '/token/intake/extraction/extract',
    recent: '/token/intake/extraction/results/recent',
  },
  parsing: {
    parse: '/token/intake/parsing/parse',
    recent: '/token/intake/parsing/calls/recent',
  },
  normalization: {
    recent: '/token/normalization/tokens/recent',
    byToken: (chain: string, address: string) =>
      `/token/normalization/tokens/${chain}/${address}`,
  },
  enrichment: {
    enrich: '/token/market-data/enrich',
    recent: '/token/market-data/snapshots/recent',
    byToken: (chain: string, address: string) =>
      `/token/market-data/snapshots/${chain}/${address}`,
  },
  classification: {
    classify: '/token/classification/classify',
    recent: '/token/classification/tokens/recent',
    byToken: (chain: string, address: string) =>
      `/token/classification/tokens/${chain}/${address}`,
  },
  scoring: {
    score: '/token/scoring/score',
    recent: '/token/scoring/tokens/recent',
    top: '/token/scoring/tokens/top',
    byToken: (chain: string, address: string) =>
      `/token/scoring/tokens/${chain}/${address}`,
  },
  filters: {
    apply: '/token/vip-call-approval/apply',
    approved: '/token/vip-call-approval/decisions/approved',
    rejected: '/token/vip-call-approval/decisions/rejected',
    recent: '/token/vip-call-approval/decisions/recent',
  },
  honeypot: {
    analyze: '/token/honeypot/analyze',
    recent: '/token/honeypot/analyses/recent',
    byToken: (chain: string, address: string) =>
      `/token/honeypot/analyses/${chain}/${address}`,
  },
  reputation: {
    list: '/telegram-kol/reputation/kols',
    top: '/telegram-kol/reputation/kols/top',
    byKol: (id: string) => `/telegram-kol/reputation/kols/${id}`,
    recompute: (id: string, formula?: string) =>
      formula
        ? `/telegram-kol/reputation/kols/recompute/${id}?formula=${encodeURIComponent(formula)}`
        : `/telegram-kol/reputation/kols/recompute/${id}`,
  },
  callTracking: {
    schedulerTick: '/token/call-tracking/scheduler/tick',
    evaluateDue: '/token/call-tracking/jobs/evaluate-due',
    enqueue: '/token/call-tracking/jobs/enqueue',
  },
  feed: {
    sources: {
      // Crypto-news sources are owned by the ingestion-service;
      // all source writes go through the ingestion API below.
      list: '/ingestion-api/feed/sources?type=crypto-news',
      add: '/ingestion-api/feed/sources',
      update: (channelId: string) => `/ingestion-api/feed/sources/${channelId}`,
      toggle: (channelId: string) =>
        `/ingestion-api/feed/sources/${channelId}/toggle`,
      delete: (channelId: string) => `/ingestion-api/feed/sources/${channelId}`,
    },
  },
  trackedCalls: {
    list: '/call-tracking/tracked',
    detail: (chain: string, address: string) =>
      `/call-tracking/tracked/${chain}/${address}`,
    gateAllow: '/call-tracking/gate-allow',
  },
  threads: {
    keywords: {
      list: '/feed-threads-publisher/keywords',
      add: '/feed-threads-publisher/keywords',
      batch: '/feed-threads-publisher/keywords/batch',
      update: (id: string) => `/feed-threads-publisher/keywords/${id}`,
      delete: (id: string) => `/feed-threads-publisher/keywords/${id}`,
    },
    blacklist: {
      list: '/feed-threads-publisher/blacklist',
      add: '/feed-threads-publisher/blacklist',
      batch: '/feed-threads-publisher/blacklist/batch',
      update: (id: string) => `/feed-threads-publisher/blacklist/${id}`,
      delete: (id: string) => `/feed-threads-publisher/blacklist/${id}`,
    },
    phrases: {
      list: '/feed-threads-publisher/phrases',
      search: (q: string) =>
        `/feed-threads-publisher/phrases/search?q=${encodeURIComponent(q)}`,
      conflictCheck: '/feed-threads-publisher/phrases/conflict-check',
    },
    queue: {
      list: '/feed-threads-publisher/queue',
      counts: '/feed-threads-publisher/queue/counts',
      cancel: (id: string) => `/feed-threads-publisher/queue/${id}`,
    },
    llm: {
      config: '/feed-threads-publisher/llm/config',
      models: '/feed-threads-publisher/llm/models',
      templates: '/feed-threads-publisher/llm/templates',
      template: (id: string) => `/feed-threads-publisher/llm/templates/${id}`,
    },
    matching: {
      config: '/threads/matching/config',
      health: '/threads/matching/health',
    },
  },
  ingestion: {
    config: '/ingestion/config',
    health: '/ingestion/health',
  },
  kolSystem: {
    // kol-system Tramo 1 (per-template dashboard, todo 14): same-origin
    // /kol-api prefix, vite dev proxies it to :3050 (KOL_SYSTEM_PROXY_TARGET),
    // prod nginx must mirror it (kol-system upstream) on deploy.
    templates: '/kol-api/templates',
    template: (id: string) => `/kol-api/templates/${encodeURIComponent(id)}`,
    templateRankings: (id: string) =>
      `/kol-api/templates/${encodeURIComponent(id)}/rankings`,
    templateSources: (id: string) =>
      `/kol-api/templates/${encodeURIComponent(id)}/sources`,
    templatePending: (id: string) =>
      `/kol-api/templates/${encodeURIComponent(id)}/pending-approvals`,
    kolRankings: (window: string, sort: string) =>
      `/kol-api/kol-rankings?window=${encodeURIComponent(window)}&sort=${encodeURIComponent(sort)}`,
    // Avatar contract (P19/P4, todo 13): ingestion-telegram serves
    // GET /api/kol-avatar/:channelId (+ avatarUrl on the source projection).
    // Code against the contract; <KolAvatar/> falls back to placeholder on 404.
    kolAvatar: (channelId: string) =>
      `/ingestion-api/kol-avatar/${encodeURIComponent(channelId)}`,
  },
  ops: {
    backupStatus: '/ops/backups/status',
  },
  feedPublisher: {
    // Tramo 2 (todo 9): queue stats, matching config, llm config and
    // scheduling/ads are served by feed-publisher (:3040 dev / :3041
    // staging / :3042 prod) behind the same-origin /feed-api prefix
    // (vite dev proxy strips it; VITE_FEED_PUBLISHER_URL overrides it
    // for direct service access). Queue list/cancel + keywords/phrases/
    // blacklist stay on the backend legacy until cutover (todo 11).
    queue: {
      // Stats only: the rich list/cancel stay on the backend legacy
      // (`/crypto-news-publisher/queue*` — slim feed-publisher views
      // carry no rawContent/media for the newsroom UI) until cutover.
      stats: () => feedPublisherPath('/api/queue/stats'),
    },
    matching: {
      config: () => feedPublisherPath('/feed-publisher/matching/config'),
      health: () => feedPublisherPath('/feed-publisher/matching/health'),
    },
    llm: {
      models: () => feedPublisherPath('/api/llm/models'),
      config: () => feedPublisherPath('/api/llm/config'),
      flags: () => feedPublisherPath('/api/llm/flags'),
      templates: () => feedPublisherPath('/api/llm/templates'),
      template: (id: string) =>
        feedPublisherPath(`/api/llm/templates/${encodeURIComponent(id)}`),
      preview: () => feedPublisherPath('/api/llm/preview'),
    },
    scheduling: {
      ads: () => feedPublisherPath('/api/scheduling/ads'),
      ad: (id: string) =>
        feedPublisherPath(`/api/scheduling/ads/${encodeURIComponent(id)}`),
      adImage: (id: string) =>
        feedPublisherPath(
          `/api/scheduling/ads/${encodeURIComponent(id)}/image`,
        ),
      adVideo: (id: string) =>
        feedPublisherPath(
          `/api/scheduling/ads/${encodeURIComponent(id)}/video`,
        ),
      adReuseLibraryMedia: (id: string) =>
        feedPublisherPath(
          `/api/scheduling/ads/${encodeURIComponent(id)}/reuse-library-media`,
        ),
      adPublishNow: (id: string) =>
        feedPublisherPath(
          `/api/scheduling/ads/${encodeURIComponent(id)}/publish-now`,
        ),
      rotationConfig: () =>
        feedPublisherPath('/api/scheduling/rotation-config'),
      mediaLibrary: () => feedPublisherPath('/api/scheduling/media/library'),
      libraryMedia: (libraryMediaId: string) =>
        feedPublisherPath(
          `/api/scheduling/media/library/${encodeURIComponent(libraryMediaId)}`,
        ),
      media: (mediaId: string) =>
        feedPublisherPath(
          `/api/scheduling/media/${encodeURIComponent(mediaId)}`,
        ),
    },
    threads: {
      // v1 skeleton (C1): every route answers 501 THREADS_NOT_IMPLEMENTED
      // until the v2 un-stubbing contract activates it.
      root: () => feedPublisherPath('/api/threads'),
    },
  },
} as const;

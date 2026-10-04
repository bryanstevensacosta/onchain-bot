import { feedPublisherPath } from './feed-publisher-base';
import { schedulingPath } from './scheduling-base';
import { marketDataPath } from './market-data-base';
import { dexterPath } from './dexter-base';

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
    // T3-todo-6 rename: legacy /token/market-data/* 307-redirects here for one version.
    enrich: '/token/enrichment/enrich',
    recent: '/token/enrichment/snapshots/recent',
    byToken: (chain: string, address: string) =>
      `/token/enrichment/snapshots/${chain}/${address}`,
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
      // @deprecated Tramo 2 todo 15: Crypto-news sources are owned by the ingestion-service;
      // New path: '/feed' newsroom via '/ingestion-api/feed/*' + feed-publisher app; removed at cutover T2-11.
      // all source writes go through the ingestion API below.
      list: '/ingestion-api/feed/sources?type=crypto-news', // @deprecated T2-15: legacy '?type=crypto-news' -> '/feed'; remove at cutover T2-11.
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
    // Tramo 2 (todo 16): profiles ARE feed-publisher sessions (one tab
    // = one session, P34) + content templates as starting points.
    // Status/evaluate/preview close the UX gaps G1/G2/G5 (todos 17/18).
    sessions: {
      list: () => feedPublisherPath('/api/sessions'),
      detail: (id: string) =>
        feedPublisherPath(`/api/sessions/${encodeURIComponent(id)}`),
      activate: (id: string) =>
        feedPublisherPath(`/api/sessions/${encodeURIComponent(id)}/activate`),
      deactivate: (id: string) =>
        feedPublisherPath(`/api/sessions/${encodeURIComponent(id)}/deactivate`),
      sources: (id: string) =>
        feedPublisherPath(`/api/sessions/${encodeURIComponent(id)}/sources`),
    },
    templates: {
      list: () => feedPublisherPath('/api/content-templates'),
      detail: (id: string) =>
        feedPublisherPath(`/api/content-templates/${encodeURIComponent(id)}`),
    },
    keywords: {
      list: () => feedPublisherPath('/feed-publisher/keywords'),
    },
    blacklist: {
      list: () => feedPublisherPath('/feed-publisher/blacklist'),
    },
    profileFilters: {
      list: (channelId: string) =>
        feedPublisherPath(
          `/feed-publisher/sources/${encodeURIComponent(channelId)}/filters`,
        ),
      toggle: (id: string) =>
        feedPublisherPath(
          `/feed-publisher/filters/${encodeURIComponent(id)}/toggle`,
        ),
      preview: (channelId: string) =>
        feedPublisherPath(
          `/feed-publisher/sources/${encodeURIComponent(channelId)}/filters/preview`,
        ),
    },
    queueList: () => feedPublisherPath('/api/queue'),
    matching: {
      config: () => feedPublisherPath('/feed-publisher/matching/config'),
      health: () => feedPublisherPath('/feed-publisher/matching/health'),
      messageStatus: (channelId: string, messageId: number) =>
        feedPublisherPath(
          `/feed-publisher/matching/messages/${encodeURIComponent(channelId)}/${messageId}/status`,
        ),
      evaluate: () => feedPublisherPath('/feed-publisher/matching/evaluate'),
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
      // Live-errors-fix 2026-09-28: scheduling moved out of
      // feed-publisher into publishing-queue (`:4080` dev / `:4081`
      // staging / `:4082` prod) behind the same-origin
      // `/scheduling-api` prefix (vite dev proxy strips it;
      // `VITE_PUBLISHING_QUEUE_URL` overrides it for direct service
      // access). Backend legacy (`/crypto-news-scheduling/*`, // @deprecated T2-15: legacy -> '/scheduling-api/*' (publishing-queue); remove at cutover T2-11.
      // `/feed-scheduling/*`) stays untouched.
      ads: () => schedulingPath('/api/scheduling/ads'),
      ad: (id: string) =>
        schedulingPath(`/api/scheduling/ads/${encodeURIComponent(id)}`),
      adImage: (id: string) =>
        schedulingPath(`/api/scheduling/ads/${encodeURIComponent(id)}/image`),
      adVideo: (id: string) =>
        schedulingPath(`/api/scheduling/ads/${encodeURIComponent(id)}/video`),
      adReuseLibraryMedia: (id: string) =>
        schedulingPath(
          `/api/scheduling/ads/${encodeURIComponent(id)}/reuse-library-media`,
        ),
      adPublishNow: (id: string) =>
        schedulingPath(
          `/api/scheduling/ads/${encodeURIComponent(id)}/publish-now`,
        ),
      rotationConfig: () => schedulingPath('/api/scheduling/rotation-config'),
      mediaLibrary: () => schedulingPath('/api/scheduling/media/library'),
      libraryMedia: (libraryMediaId: string) =>
        schedulingPath(
          `/api/scheduling/media/library/${encodeURIComponent(libraryMediaId)}`,
        ),
      media: (mediaId: string) =>
        schedulingPath(`/api/scheduling/media/${encodeURIComponent(mediaId)}`),
    },
    threads: {
      // v1 skeleton (C1): every route answers 501 THREADS_NOT_IMPLEMENTED
      // until the v2 un-stubbing contract activates it.
      root: () => feedPublisherPath('/api/threads'),
    },
  },
  marketData: {
    // Tramo 3 (todo 7): market-data `:4000` dev / `:4001` staging /
    // `:4002` prod behind the same-origin /market-data-api prefix
    // (vite dev proxy strips it; VITE_MARKET_DATA_URL overrides it
    // for direct service access).
    chains: marketDataPath('/api/v1/chains'),
    chain: (id: string) =>
      marketDataPath(`/api/v1/chains/${encodeURIComponent(id)}`),
    detect: (address: string) =>
      marketDataPath(
        `/api/v1/chains/detect?address=${encodeURIComponent(address)}`,
      ),
    providers: marketDataPath('/api/v1/providers'),
    provider: (name: string) =>
      marketDataPath(`/api/v1/providers/${encodeURIComponent(name)}`),
    address: (chain: string, address: string, kind?: string) => {
      const base = `/api/v1/addresses/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`;
      return marketDataPath(
        kind ? `${base}?kind=${encodeURIComponent(kind)}` : base,
      );
    },
    token: (chain: string, address: string) =>
      marketDataPath(
        `/api/v1/tokens/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`,
      ),
    compatSnapshot: (chain: string, address: string) =>
      marketDataPath(
        `/api/market-data/snapshot?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}`,
      ),
    batch: () => marketDataPath('/api/v1/addresses/batch'),
  },
  dexter: {
    // Dexter bot binding (exclusive-gateway task): the lookup bot is
    // bound FROM the gateway inventory — create (env token → vault),
    // link-as-target (bind), edit (relink = unbind + bind), unlink.
    // Same-origin `/dexter-api` prefix (vite dev → `:4060`).
    inventory: dexterPath('/api/dexter-bots/inventory'),
    bind: dexterPath('/api/dexter-bots/bind'),
    unbind: dexterPath('/api/dexter-bots/unbind'),
    migrate: dexterPath('/api/dexter-bots/migrate-to-gateway'),
  },
} as const;

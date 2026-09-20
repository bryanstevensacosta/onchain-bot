export const ENDPOINTS = {
  kols: {
    list: '/telegram-kol/identity/kols',
    get: (id: string) => `/telegram-kol/identity/kols/${id}`,
    backfill: (id: string) => `/telegram-kol/identity/kols/${id}/backfill`,
    add: '/telegram-kol/identity/kols',
    setLifecycle: (id: string) => `/telegram-kol/identity/kols/${id}/lifecycle`,
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
  cryptoNews: {
    sources: {
      // Crypto-news sources are owned by the ingestion-service;
      // all source writes go through the ingestion API below.
      list: '/ingestion-api/crypto-news/sources',
      add: '/ingestion-api/crypto-news/sources',
      update: (channelId: string) =>
        `/ingestion-api/crypto-news/sources/${channelId}`,
      toggle: (channelId: string) =>
        `/ingestion-api/crypto-news/sources/${channelId}/toggle`,
      delete: (channelId: string) =>
        `/ingestion-api/crypto-news/sources/${channelId}`,
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
      list: '/threads-publisher/keywords',
      add: '/threads-publisher/keywords',
      batch: '/threads-publisher/keywords/batch',
      update: (id: string) => `/threads-publisher/keywords/${id}`,
      delete: (id: string) => `/threads-publisher/keywords/${id}`,
    },
    blacklist: {
      list: '/threads-publisher/blacklist',
      add: '/threads-publisher/blacklist',
      batch: '/threads-publisher/blacklist/batch',
      update: (id: string) => `/threads-publisher/blacklist/${id}`,
      delete: (id: string) => `/threads-publisher/blacklist/${id}`,
    },
    phrases: {
      list: '/threads-publisher/phrases',
      search: (q: string) =>
        `/threads-publisher/phrases/search?q=${encodeURIComponent(q)}`,
      conflictCheck: '/threads-publisher/phrases/conflict-check',
    },
    queue: {
      list: '/threads-publisher/queue',
      counts: '/threads-publisher/queue/counts',
      cancel: (id: string) => `/threads-publisher/queue/${id}`,
    },
    llm: {
      config: '/threads-publisher/llm/config',
      models: '/threads-publisher/llm/models',
      templates: '/threads-publisher/llm/templates',
      template: (id: string) => `/threads-publisher/llm/templates/${id}`,
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
  ops: {
    backupStatus: '/ops/backups/status',
  },
  cryptoNewsPublisher: {
    llm: {
      models: '/crypto-news-publisher/llm/models',
      config: '/crypto-news-publisher/llm/config',
      templates: '/crypto-news-publisher/llm/templates',
      template: (id: string) =>
        `/crypto-news-publisher/llm/templates/${encodeURIComponent(id)}`,
      preview: '/crypto-news-publisher/llm/preview',
    },
  },
} as const;

export const ENDPOINTS = {
  kols: {
    list: '/telegram-kol/identity/kols',
    get: (id: string) => `/telegram-kol/identity/kols/${id}`,
    backfill: (id: string) => `/telegram-kol/ingestion/kols/${id}/backfill`,
    add: '/telegram-kol/identity/kols',
    setLifecycle: (id: string) => `/telegram-kol/identity/kols/${id}/lifecycle`,
  },
  publishing: {
    published: '/telegram-publishing/calls/published',
    failed: '/telegram-publishing/calls/failed',
    recent: '/telegram-publishing/calls/recent',
    byToken: (chain: string, address: string) =>
      `/telegram-publishing/calls/${chain}/${address}`,
    publish: '/telegram-publishing/publish',
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
    apply: '/token/token-gating/apply',
    approved: '/token/token-gating/decisions/approved',
    rejected: '/token/token-gating/decisions/rejected',
    recent: '/token/token-gating/decisions/recent',
    byToken: (chain: string, address: string) =>
      `/token/token-gating/decisions/${chain}/${address}`,
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
    recompute: (id: string) => `/telegram-kol/reputation/kols/recompute/${id}`,
  },
  callTracking: {
    schedulerTick: '/token/call-tracking/scheduler/tick',
    evaluateDue: '/token/call-tracking/jobs/evaluate-due',
    enqueue: '/token/call-tracking/jobs/enqueue',
  },
} as const;

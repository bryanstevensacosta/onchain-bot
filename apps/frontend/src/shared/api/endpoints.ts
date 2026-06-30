export const ENDPOINTS = {
  dashboard: {
    kpis: '/dashboard/kpis',
  },
  kols: {
    list: '/telegram-kol/identity/kols',
    get: (id: string) => `/telegram-kol/identity/kols/${id}`,
    backfill: (id: string) => `/telegram-kol/ingestion/kols/${id}/backfill`,
    add: '/telegram-kol/identity/kols',
    setLifecycle: (id: string) => `/telegram-kol/identity/kols/${id}/lifecycle`,
  },
  publishing: {
    published: '/vip-calls/calls/published',
    failed: '/vip-calls/calls/failed',
    recent: '/vip-calls/calls/recent',
    byToken: (chain: string, address: string) =>
      `/vip-calls/calls/${chain}/${address}`,
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
    byToken: (chain: string, address: string) =>
      `/token/vip-call-approval/decisions/${chain}/${address}`,
    decisionsRejectedVerify: '/token/vip-call-approval/decisions/rejected/verify',
    reprocessBatch: '/token/vip-call-approval/reprocess/rejected',
    reprocessOne: (chain: string, address: string) =>
      `/token/vip-call-approval/reprocess/${chain}/${address}`,
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
  trackedCalls: {
    list: '/call-tracking/tracked',
    detail: (chain: string, address: string) =>
      `/call-tracking/tracked/${chain}/${address}`,
    gateAllow: '/call-tracking/gate-allow',
  },
  ingestion: {
    config: '/ingestion/config',
    health: '/ingestion/health',
  },
} as const;

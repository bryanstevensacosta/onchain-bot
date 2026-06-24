export type BadgeTone =
  | 'green'
  | 'yellow'
  | 'amber'
  | 'orange'
  | 'red'
  | 'blue'
  | 'gray'
  | 'cyan'
  | 'white';

const SIGNAL_PREFIX = 'SIGNAL_';

export const RISK_SIGNAL_LABELS: Readonly<Record<string, string>> = {
  LOW_LIQUIDITY: 'Low liquidity',
  NO_HOLDERS: 'No holders',
  LOW_HOLDERS: 'Low holders',
  NO_PAIRS: 'No trading pairs',
  CONCENTRATED_HOLDERS: 'Concentrated holders',
  EXTREME_PRICE_CHANGE: 'Extreme price change',
  MICROCAP: 'Micro-cap',
  NO_NAME: 'No token name',
  NO_MARKET_DATA: 'No market data',
  POSSIBLE_RUG: 'Possible rug pull',
};

export const HONEYPOT_SIGNAL_LABELS: Readonly<Record<string, string>> = {
  HIGH_BUY_TAX: 'High buy tax',
  HIGH_SELL_TAX: 'High sell tax',
  HIGH_TRANSFER_TAX: 'High transfer tax',
  CANNOT_SELL: 'Cannot sell',
  CANNOT_BUY: 'Cannot buy',
  OWNER_CAN_DRAIN: 'Owner can drain liquidity',
  OWNER_NOT_RENOUNCED: 'Ownership not renounced',
  SELF_DESTRUCT_RISK: 'Self-destruct risk',
  PROXY_PATTERN: 'Proxy pattern',
  BLACKLIST_FUNCTION: 'Blacklist function',
  WHITELIST_ONLY: 'Whitelist-only trading',
  HONEYPOT_FLAG: 'Honeypot flagged',
};

export const FILTER_REASON_LABELS: Readonly<Record<string, string>> = {
  SCORE_TOO_LOW: 'Score too low',
  CLASSIFICATION_BLOCKED: 'Classification blocked',
  BLACKLISTED: 'Blacklisted',
  HONEYPOT_SUSPECTED: 'Honeypot suspected',
  RISK_WEIGHT_EXCEEDED: 'Risk weight exceeded',
  INSUFFICIENT_DATA: 'Insufficient data',
  CHAIN_UNSUPPORTED: 'Chain unsupported',
};

export const SCORING_FACTOR_LABELS: Readonly<Record<string, string>> = {
  LIQUIDITY_HIGH: 'High Liquidity',
  LIQUIDITY_MEDIUM: 'Medium Liquidity',
  LIQUIDITY_LOW: 'Low Liquidity',
  LIQUIDITY_INSUFFICIENT: 'Insufficient Liquidity',
  HOLDERS_HIGH: 'High Holders',
  HOLDERS_MEDIUM: 'Medium Holders',
  HOLDERS_LOW: 'Low Holders',
  HOLDERS_NONE: 'No Holders',
  MC_HIGH: 'High Market Cap',
  MC_MEDIUM: 'Medium Market Cap',
  MC_LOW: 'Low Market Cap',
  VOLUME_HIGH: 'High Volume',
  VOLUME_LOW: 'Low Volume',
  MULTI_CHANNEL_BUZZ: 'Multi-Channel Buzz',
  TWO_CHANNELS: 'Two Channels',
  HIGH_MENTION_COUNT: 'High Mentions',
  MULTIPLE_MENTIONS: 'Multiple Mentions',
  SIGNAL_HONEYPOT: 'Honeypot risk',
  SIGNAL_BLACKLIST: 'Blacklist risk',
  CHANNEL_REPUTATION: 'Channel Reputation',
  SECURITY_FLAG_CAP: 'Security Cap',
  SIGNAL_POSSIBLE_RUG: 'Possible rug pull',
  SIGNAL_NO_HOLDERS: 'No holders',
  SIGNAL_LOW_HOLDERS: 'Low holders',
  SIGNAL_NO_NAME: 'No token name',
  SIGNAL_LOW_LIQUIDITY: 'Low liquidity',
  SIGNAL_NO_PAIRS: 'No trading pairs',
  SIGNAL_CONCENTRATED_HOLDERS: 'Concentrated holders',
  SIGNAL_EXTREME_PRICE_CHANGE: 'Extreme price change',
  SIGNAL_MICROCAP: 'Micro-cap',
  SIGNAL_NO_MARKET_DATA: 'No market data',
};

export const RISK_LEVEL_LABELS: Readonly<Record<string, string>> = {
  LOW: 'Low risk',
  MEDIUM: 'Medium risk',
  HIGH: 'High risk',
  CRITICAL: 'Critical risk',
};

export const RISK_LEVEL_TONE: Readonly<Record<string, BadgeTone>> = {
  LOW: 'gray',
  MEDIUM: 'yellow',
  HIGH: 'orange',
  CRITICAL: 'red',
};

export const REASON_TONE: Readonly<Record<string, BadgeTone>> = {
  SCORE_TOO_LOW: 'yellow',
  CLASSIFICATION_BLOCKED: 'orange',
  BLACKLISTED: 'red',
  HONEYPOT_SUSPECTED: 'orange',
  RISK_WEIGHT_EXCEEDED: 'yellow',
  INSUFFICIENT_DATA: 'yellow',
  CHAIN_UNSUPPORTED: 'gray',
};

export function humanize(code: string): string {
  if (!code) return '';
  const spaced = code.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function lookupSignal(code: string): string | undefined {
  return (
    SCORING_FACTOR_LABELS[code] ??
    RISK_SIGNAL_LABELS[code] ??
    HONEYPOT_SIGNAL_LABELS[code]
  );
}

export function signalLabel(code: string): string {
  if (!code) return '';
  const direct = lookupSignal(code);
  if (direct !== undefined) return direct;
  if (code.startsWith(SIGNAL_PREFIX)) {
    const stripped = code.slice(SIGNAL_PREFIX.length);
    const mapped = lookupSignal(stripped);
    if (mapped !== undefined) return mapped;
    return humanize(stripped);
  }
  return humanize(code);
}

export function reasonLabel(code: string): string {
  if (!code) return '';
  return FILTER_REASON_LABELS[code] ?? humanize(code);
}

export function riskLevelLabel(level: string): string {
  return RISK_LEVEL_LABELS[level] ?? humanize(level);
}

export function riskLevelTone(level: string): BadgeTone {
  return RISK_LEVEL_TONE[level] ?? 'gray';
}

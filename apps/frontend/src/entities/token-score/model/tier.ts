import type { ScoreTier } from '@/shared/realtime/events';

export function scoreTone(
  score: number,
): 'green' | 'yellow' | 'orange' | 'red' {
  if (score >= 70) return 'green';
  if (score >= 50) return 'yellow';
  if (score >= 30) return 'orange';
  return 'red';
}

export function tierLabel(tier: ScoreTier): string {
  return tier;
}

export function tierTone(
  tier: ScoreTier,
): 'green' | 'yellow' | 'orange' | 'red' | 'gray' {
  switch (tier) {
    case 'STRONG':
      return 'green';
    case 'DECENT':
    case 'GOOD':
      return 'yellow';
    case 'NEUTRAL':
      return 'gray';
    case 'RISKY':
    case 'POOR':
      return 'orange';
    case 'AVOID':
    case 'FAILED':
      return 'red';
    default:
      return 'gray';
  }
}

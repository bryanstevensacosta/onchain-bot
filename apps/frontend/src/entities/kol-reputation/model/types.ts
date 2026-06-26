export type KolConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export interface KolReputationMetrics {
  totalMentions: number;
  x2Count: number;
  x5Count: number;
  x10Count: number;
  x50Count: number;
  rug50Count: number;
  rug80Count: number;
  neutralCount: number;
  mentionScore: number;
  qualityScore: number;
  drawdownScore: number;
}

export interface KolReputationView {
  kolId: string;
  score: number;
  metrics: KolReputationMetrics;
  confidence: KolConfidence;
  isTrusted: boolean;
  isSuspicious: boolean;
  lastEvaluatedAt: string;
}
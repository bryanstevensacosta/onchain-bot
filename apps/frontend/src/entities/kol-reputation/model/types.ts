export type KolConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export interface KolReputationView {
  kolId: string;
  score: number;
  totalCalls: number;
  strongCalls: number;
  goodCalls: number;
  neutralCalls: number;
  poorCalls: number;
  failedCalls: number;
  successRate: number;
  failureRate: number;
  avgAthMultiple: number | null;
  confidence: KolConfidence;
  isTrusted: boolean;
  isSuspicious: boolean;
  lastEvaluatedAt: string;
}

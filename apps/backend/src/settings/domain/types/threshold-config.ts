export interface ThresholdConfig {
  id: string;
  scope: 'token' | 'kol';
  minScore: number;
  maxScore: number;
  decision: string;
}

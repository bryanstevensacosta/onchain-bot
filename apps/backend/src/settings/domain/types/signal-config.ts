export interface SignalConfig {
  id: string;
  code: string;
  name: string;
  penalty: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
  appliesTo: 'token' | 'kol';
  createdAt: Date;
  updatedAt: Date;
}

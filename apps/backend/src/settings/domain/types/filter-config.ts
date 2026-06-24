export interface FilterConfig {
  id: string;
  type: string;
  value: string;
  numericValue: number | null;
  scope: 'token' | 'kol' | 'all' | 'global';
  enabled: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

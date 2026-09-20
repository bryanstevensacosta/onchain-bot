export interface BackupStatus {
  verdict: 'green' | 'amber' | 'red';
  newestFile: string;
  newestAgeH: string;
  dumpCount: number;
  diskPct: number;
  bucket: string | null;
  offsiteLag: string | null;
  lastDrillAt: string | null;
  lastDrillResult: 'pass' | 'fail' | 'unknown';
  stale: boolean;
}

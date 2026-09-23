import { Inject, Injectable, Optional } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

/** DI token for the drill-generated status file path (env-overridable for tests). */
export const BACKUP_STATUS_PATH = 'BACKUP_STATUS_PATH';

/** Prod default — served via a read-only bind mount (see docker-compose.prod.yml). */
export const DEFAULT_BACKUP_STATUS_PATH =
  '/opt/onchain-bot/backups/.rolling-status.json';

// ESCALA ÚNICA (docs/deployment/BACKUPS.md §5) — single threshold scale.
// backup age fail > 26h · disk warn >= 80% / fail >= 90% or < 2 GB free ·
// count warn != 7 (never fail on count) · offsite lag warn > 26h (informational here).
const MAX_BACKUP_AGE_H = 26;
const DISK_WARN_PCT = 80;
const DISK_FAIL_PCT = 90;
const DISK_MIN_FREE_GB = 2;
const EXPECTED_DUMP_COUNT = 7;
/**
 * Snapshot freshness guard: the drill writes weekly (Sun 05:00 UTC), so the
 * status file itself is only stale past this age — distinct from the backup
 * age above. Staging has no backups by design: the file is absent there and
 * this service returns the red missing shape (never 500).
 */
const SNAPSHOT_MAX_AGE_DAYS = 10;

export type BackupVerdict = 'green' | 'amber' | 'red';
export type DrillResult = 'pass' | 'fail' | 'unknown';

/**
 * Live view of the prod-backend rolling backups. Field names are frozen —
 * the frontend mirrors this exact shape verbatim (badge depends on it).
 * Error cases (missing/stale/malformed file) keep the SAME shape plus an
 * `error` field and `verdict: 'red'` — this endpoint never throws/500s.
 * Names/sizes/ages only — no secrets, no directory listing (serves the JSON only).
 */
export interface BackupStatusView {
  readonly verdict: BackupVerdict;
  readonly newestFile: string;
  readonly newestAgeH: string;
  readonly dumpCount: number;
  readonly diskPct: number;
  readonly bucket: string | null;
  readonly offsiteLag: string | null;
  readonly lastDrillAt: string | null;
  readonly lastDrillResult: DrillResult;
  readonly stale: boolean;
  readonly error?: string;
}

/** Non-secret read config (mirrors the threads config/health split). */
export interface BackupConfigView {
  readonly statusPath: string;
  readonly maxBackupAgeH: number;
  readonly diskWarnPct: number;
  readonly diskFailPct: number;
  readonly diskMinFreeGb: number;
  readonly expectedDumpCount: number;
  readonly snapshotMaxAgeDays: number;
}

/** Raw drill-generated shape (scripts/backup-drill.sh — keys STABLE). */
interface RollingStatusFile {
  readonly updated_at?: unknown;
  readonly latest_file?: unknown;
  readonly latest_age_h?: unknown;
  readonly count?: unknown;
  readonly disk_pct?: unknown;
  readonly disk_free_gb?: unknown;
  readonly bucket?: unknown;
  readonly offsite_lag_h?: unknown;
  readonly last_drill?: {
    readonly at?: unknown;
    readonly result?: unknown;
  };
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

@Injectable()
export class BackupsStatusService {
  private readonly statusPath: string;

  public constructor(
    @Optional()
    @Inject(BACKUP_STATUS_PATH)
    statusPath?: string,
  ) {
    this.statusPath =
      statusPath ??
      process.env.BACKUP_STATUS_PATH ??
      DEFAULT_BACKUP_STATUS_PATH;
  }

  public getConfig(): BackupConfigView {
    return {
      statusPath: this.statusPath,
      maxBackupAgeH: MAX_BACKUP_AGE_H,
      diskWarnPct: DISK_WARN_PCT,
      diskFailPct: DISK_FAIL_PCT,
      diskMinFreeGb: DISK_MIN_FREE_GB,
      expectedDumpCount: EXPECTED_DUMP_COUNT,
      snapshotMaxAgeDays: SNAPSHOT_MAX_AGE_DAYS,
    };
  }

  public async getStatus(): Promise<BackupStatusView> {
    let raw: string;
    try {
      raw = await readFile(this.statusPath, 'utf8');
    } catch {
      return this.red({
        newestFile: '(missing)',
        error: `status file not found: ${this.statusPath}`,
      });
    }

    let parsed: RollingStatusFile;
    try {
      parsed = JSON.parse(raw) as RollingStatusFile;
    } catch {
      return this.red({ error: 'status file is not valid JSON' });
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return this.red({ error: 'status file is not a JSON object' });
    }

    const newestFile = asString(parsed.latest_file) ?? '(missing)';
    const ageH = asNumber(parsed.latest_age_h);
    const dumpCount = asNumber(parsed.count);
    const diskPct = asNumber(parsed.disk_pct);
    if (ageH === null || dumpCount === null || diskPct === null) {
      return this.red({
        newestFile,
        error: 'status file missing required numeric fields',
      });
    }

    const diskFreeGb = asNumber(parsed.disk_free_gb);
    const snapshotAgeMs = this.snapshotAgeMs(asString(parsed.updated_at));
    const backupStale = ageH > MAX_BACKUP_AGE_H;
    const snapshotStale =
      snapshotAgeMs === null ||
      snapshotAgeMs > SNAPSHOT_MAX_AGE_DAYS * 86_400_000;
    const diskFailed =
      diskPct >= DISK_FAIL_PCT ||
      (diskFreeGb !== null && diskFreeGb < DISK_MIN_FREE_GB);

    let verdict: BackupVerdict = 'green';
    if (backupStale || snapshotStale || diskFailed) {
      verdict = 'red';
    } else if (diskPct >= DISK_WARN_PCT || dumpCount !== EXPECTED_DUMP_COUNT) {
      verdict = 'amber';
    }

    const stale = backupStale || snapshotStale;
    if (stale) verdict = 'red';

    const lastDrillAt = asString(parsed.last_drill?.at);
    const drillResult = asString(parsed.last_drill?.result);
    const bucket = asString(parsed.bucket);
    const offsiteLagH = asNumber(parsed.offsite_lag_h);

    return {
      verdict,
      newestFile,
      newestAgeH: `${ageH}h`,
      dumpCount,
      diskPct,
      bucket,
      offsiteLag: offsiteLagH === null ? null : `${offsiteLagH}h`,
      lastDrillAt,
      lastDrillResult:
        drillResult === 'pass'
          ? 'pass'
          : drillResult === 'fail'
            ? 'fail'
            : 'unknown',
      stale,
      ...(stale
        ? {
            error: backupStale
              ? `newest backup is ${ageH}h old (>26h ESCALA UNICA fail threshold)`
              : 'status snapshot is stale',
          }
        : {}),
    };
  }

  private snapshotAgeMs(updatedAt: string | null): number | null {
    if (updatedAt === null) return null;
    const ms = Date.parse(updatedAt);
    if (Number.isNaN(ms)) return null;
    return Math.max(0, Date.now() - ms);
  }

  private red(partial: {
    readonly newestFile?: string;
    readonly error: string;
  }): BackupStatusView {
    return {
      verdict: 'red',
      newestFile: partial.newestFile ?? '(missing)',
      newestAgeH: 'unknown',
      dumpCount: 0,
      diskPct: 0,
      bucket: null,
      offsiteLag: null,
      lastDrillAt: null,
      lastDrillResult: 'unknown',
      stale: true,
      error: partial.error,
    };
  }
}

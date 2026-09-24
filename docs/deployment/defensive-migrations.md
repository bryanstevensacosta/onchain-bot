# Defensive Migrations — Pattern + Checklist + Inventory Notes

> **Scope:** TypeORM migrations in `apps/backend/src/shared/common/persistence/migrations/`
> and `apps/ingestion-telegram/src/shared/common/persistence/migrations/`.
> Plan: `.omo/plans/prod-safety-gates.md` item 3 · Evidence: `.omo/evidence/task-3-prod-safety-gates.txt`.
>
> **Rule zero (immutability):** applied migrations are NEVER rewritten. Asserts go
> into PENDING migrations only. Applied-but-assert-less migrations get runbook
> notes below (§4) — documentation, not edits.

---

## 1. The pattern (canonical example)

`DropCryptoNewsSourcesResidual1790200000000`
(`apps/ingestion-telegram/.../migrations/1790200000000-DropCryptoNewsSourcesResidual.ts`):

```ts
public async up(queryRunner: QueryRunner): Promise<void> {
  const rows: Array<{ count: string }> = await queryRunner.query(
    `SELECT count(*) AS count FROM "crypto_news_sources"`,
  );
  const count = Number(rows?.[0]?.count ?? NaN);
  if (!Number.isFinite(count)) {
    throw new Error(
      'DropCryptoNewsSourcesResidual: could not count crypto_news_sources rows — aborting',
    );
  }
  if (count !== 0) {
    throw new Error(
      `DropCryptoNewsSourcesResidual: crypto_news_sources still holds ${count} row(s) — aborting (migrate rows to telegram_feed_sources first)`,
    );
  }
  // ... mutation only AFTER the gate passes
}
```

Three mandatory properties for every future destructive migration:

1. **Pre-check before mutation** — `SELECT count(*)` (or `to_regclass` existence
   probe) runs FIRST; no DDL executes before the gate passes.
2. **Actionable error message** — names WHAT to do, not just what failed
   (`migrate rows to telegram_feed_sources first`), plus the backup artifact
   path convention (§3) so the operator knows what to restore from.
3. **Abort, never degrade** — `throw` stops the migration transaction; a
   half-dropped schema is worse than a blocked deploy.

## 2. Checklist (every destructive migration PR)

- [ ] Pre-execution assert present (counts == 0, or backup-path existence verified
      in code) with actionable message (WHAT to do + backup path).
- [ ] Full DB backup artifact named per §3 BEFORE `migration:run`
      (deploys already do this: `deploy.yml` / `deploy-ingestion.yml` backup steps —
      verify the artifact exists, don't assume).
- [ ] `down()` restores SHAPE; rows restore only via backup (state this in the
      migration header comment — `down()` recreating an empty schema is expected,
      not a bug).
- [ ] Value-preserving order where applicable: copy/migrate rows FIRST, drop
      AFTER (cf. `SplitLlmConfigFlags`, `AddAdMedia`, `DropLlmConfigMatchingEnabled`).
- [ ] `migration:show` reviewed on dev DBs: no pending surprises, ordering
      guaranteed by timestamp prefix.
- [ ] Merge-gate evidence recorded (staging smoke + migration drill per PR template).

## 3. Backup artifact conventions (names the assert must cite)

| DB        | Artifact (Oracle server)                                                                | Restore one-liner (decompress on the pipe — never raw `.gz` into `pg_restore`)                                                                                                               |
| --------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend   | `/opt/onchain-bot/backups/prod-backend-YYYYMMDD.dump.gz` (+ `.meta.txt` sidecar)        | `gunzip -c /opt/onchain-bot/backups/prod-backend-YYYYMMDD.dump.gz \| pg_restore --clean --if-exists -U alpha_meta_token_scanner -d alpha_meta_token_scanner --role=alpha_meta_token_scanner` |
| Ingestion | `/data/backups/ingestion/ingestion-backup-*.dump` (7-day prune, `deploy-ingestion.yml`) | `gunzip -c /data/backups/ingestion/<file-if-gzipped> \| pg_restore --clean --if-exists -U alpha_meta_token_scanner -d alpha_meta_token_scanner_ingestion --role=alpha_meta_token_scanner`    |

Full restore runbook (integrity check FIRST via `sha256sum -c`): `docs/deployment/BACKUPS.md` §7.
Table-scoped pre-drop snapshot (for single-table DROP asserts):
`pg_dump -t <table> <db> | gzip > /opt/onchain-bot/backups/pre-drop-<table>-YYYYMMDD.dump.gz`.

## 4. Applied-but-assert-less destructive migrations (runbook notes, NOT edits)

All of these are recorded in `typeorm_migrations` on dev DBs (`migration:show`
all-`[X]`, zero pending — verified 2026-09-24). They predate the pattern and
MUST NOT be rewritten. Notes for the operator encountering them in history:

| Migration                                                  | Dropped                                                                    | Why it was safe without an assert                                                                                                                                                                                                                            | If you ever need its data back                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| backend `1850000000000-DropChainDexterChatTables`          | `chain_dexter_chat_settings`, `chain_dexter_chat_groups`                   | Ephemeral chat-settings cache (re-derivable from Telegram); no FKs inbound                                                                                                                                                                                   | Pre-deploy `prod-backend-*.dump.gz` (§3) — no table-scoped dump exists                                  |
| backend `1860000000001-DropIngestionOwnedCryptoNewsTables` | `crypto_news_message_media`, `crypto_news_messages`, `crypto_news_sources` | Ownership moved to ingestion DB (split 2026-09-08); backend held a stale copy. DDL transcribed verbatim from `/tmp/pre-split-backup.dump` (see header comment + `.omo/evidence/task-5-db-separation.md` §0)                                                  | `/tmp/pre-split-backup.dump` (todo 4) or pre-deploy dump; live data serves from ingestion `:3032/:3033` |
| backend `1877000000000-DropKolsTable`                      | `kols`                                                                     | KOL identity moved to ingestion `telegram_feed_sources type='kol'`; header documents a MANUAL parity gate (counts + 20-row sample diff, evidenced `.omo/evidence/task-8-telegram-feed-unification.txt`; dev had 0 rows). No FKs inbound (verified in-header) | Pre-drop `pg_dump -t kols` or item-6 backfill re-run (`scripts/backfill-kols-to-feed.ts` reversed)      |
| backend `1788659125192-SplitLlmConfigFlags`                | column `llm_config.enabled`                                                | Value-preserving: copied to 3 flags first (guarded by `information_schema` check for synchronize-era DBs)                                                                                                                                                    | Pre-deploy dump; values recoverable from the 3 successor columns                                        |
| backend `1820000000000-AddAdMedia`                         | column `crypto_news_ads.image_path`                                        | Value-preserving: rows migrated into `crypto_news_ad_media` + `image_media_id` first; `down()` restores both directions                                                                                                                                      | Pre-deploy dump; values live in `crypto_news_ad_media.file_path`                                        |
| backend `1875000000002-DropLlmConfigMatchingEnabled`       | column `llm_config.matching_enabled`                                       | Value-preserving: backfilled into `crypto_news_matching_config.enabled` by `1875000000000` (timestamp-ordered) first                                                                                                                                         | Pre-deploy dump; truth lives in `crypto_news_matching_config`                                           |
| ingestion `1789987837661-ConvertMessageEntitiesToJsonb`    | (lossy ALTER: TEXT → jsonb)                                                | `USING` CASE total over real writer data (`NULL`/`''` → `'[]'`); try-cast sweep found 0 non-JSON rows (see header)                                                                                                                                           | Pre-deploy ingestion dump (`/data/backups/ingestion/`)                                                  |

## 5. Explicitly NOT destructive (no assert required)

- **Pure ADD/CREATE/BACKFILL:** every other backend migration (baselines, ad
  tables, publisher tables, threads tables, dead-letter queue, queued-at,
  formatting entities, dedup, filter configs, llm flags) and ingestion
  `CreateTelegramFeedSources` — additive `up()`; `down()`-only DROPs are
  rollback paths, not deployment hazards.
- **Row-preserving RENAMEs:** ingestion `TelegramFeedMessages` and
  `FeedMessageMediaRename` — `ALTER TABLE ... RENAME` preserves rows by design
  (no copy, no invented data); the media `file_path` rewrite is segment-matched
  (`LIKE '%crypto-news/media/%'`) with a documented no-match remediation in the
  header. No assert needed — and none added.

# RUNBOOK — Rename backend tables `crypto_news_*` → `feed_*` (P35)

**STATUS: NOT EXECUTED.** Staging-first, prod needs explicit approval (§7 gate).
P35 decision (`.omo/drafts/mega-refactor-tramos.md` §7.6): code + files + `feed-publisher/`
app rename is done; **DB tables/columns rename is pending — this runbook**.
Live READ-ONLY inventory 2026-09-25: `.omo/evidence/feed-tables-audit.log`
(names + counts only, zero writes, zero secrets). No step below has been run anywhere.

**Live DB names (do not trust stale docs — verify at execution):**
staging backend = `onchain_bot_staging` (ALREADY renamed from `alpha_*`; DB.md is stale here),
prod backend = `alpha_meta_token_scanner` (untouched). Ingestion DBs need NO action
(both already `telegram_feed_*`, 0 `crypto_news_*` tables).

## 0. Scope

- IN: 14 `crypto_news_*` tables in the **backend DB, per env** (staging + prod) — §1.
- OUT (no rename): unprefixed feed-scoped tables `blacklist_phrases`,
  `channel_content_filter_configs`, `dead_letter_queue`, `dedup_fingerprints`;
  `threads_*` tables (move to feed-publisher as-is; threads naming is Tramo 2's call);
  ingestion DBs (`telegram_feed_*` already final); the cross-DB MOVE to the
  feed-publisher database (Tramo 2 plan owns it — this runbook does rename-IN-PLACE
  first so the move later carries final names).
- Columns: **zero** columns carry crypto refs (verified) → table renames only.

## 1. Per-table mapping (mechanical `crypto_news_` → `feed_`)

Mechanical swap per P35 literal wording. 3rd column = feed-publisher entity name
today (mismatch ≠ blocker — Tramo 2 move maps to final names; see §6).

| #   | BEFORE (live)                          | AFTER (mechanical)              | feed-publisher entity today                | match?                             |
| --- | -------------------------------------- | ------------------------------- | ------------------------------------------ | ---------------------------------- |
| 1   | crypto_news_sources                    | feed_sources                    | — (ingestion owns `telegram_feed_sources`) | n/a — rename anyway, move drops it |
| 2   | crypto_news_publisher_queue            | feed_publisher_queue            | `feed_publisher_queue`                     | ✅                                 |
| 3   | crypto_news_publisher_keywords         | feed_publisher_keywords         | `feed_publisher_keywords`                  | ✅                                 |
| 4   | crypto_news_matching_config            | feed_matching_config            | `feed_publisher_matching_config`           | ⚠️ (map at move)                   |
| 5   | crypto_news_publisher_llm_config       | feed_publisher_llm_config       | `feed_llm_config`                          | ⚠️ (map at move)                   |
| 6   | crypto_news_publisher_prompt_templates | feed_publisher_prompt_templates | `feed_prompt_templates`                    | ⚠️ (map at move)                   |
| 7   | crypto_news_publisher_slot_state       | feed_publisher_slot_state       | — (none yet)                               | n/a                                |
| 8   | crypto_news_publisher_throttle_state   | feed_publisher_throttle_state   | — (none yet)                               | n/a                                |
| 9   | crypto_news_ads                        | feed_ads                        | `feed_scheduled_ads` (P36)                 | ⚠️ (map at move)                   |
| 10  | crypto_news_ad_media                   | feed_ad_media                   | `feed_scheduled_ad_media` (P36)            | ⚠️ (map at move)                   |
| 11  | crypto_news_ad_media_library           | feed_ad_media_library           | `feed_ad_media_library`                    | ✅                                 |
| 12  | crypto_news_ad_rotation_config         | feed_ad_rotation_config         | `feed_scheduling_config` (P36)             | ⚠️ (map at move)                   |
| 13  | crypto_news_ad_rotation_state          | feed_ad_rotation_state          | `feed_scheduling_state` (P36)              | ⚠️ (map at move)                   |
| 14  | crypto_news_ads_throttle_state         | feed_ads_throttle_state         | — (none yet)                               | n/a                                |

Decision (P35-literal): **Option A — mechanical prefix swap now, final-name mapping at
Tramo 2 move.** Rationale: reversible, decoupled from still-shifting feed-publisher
naming (threads/scheduling open items), staging-validated. Option B (rename straight to
feed-publisher names) REJECTED: couples this DDL to Tramo 2 naming churn + breaks the
P35-literal `feed_*` contract the Tramo 2 plan codes against.

## 2. Migration SQL (one transaction, writers stopped)

TypeORM migration `apps/backend/src/shared/common/persistence/migrations/1880000000000-RenameCryptoNewsToFeed.ts`
(next free prefix after `1877000000000-DropKolsTable`; follow the idempotent
`IF EXISTS` style of `1875000000002`/`1876000000000`). Raw SQL via `queryRunner.query`
— `renameTable()` per table is equivalent; raw SQL keeps the 14 renames reviewable.

```sql
-- UP (single transaction; ACCESS EXCLUSIVE per table, ms-scale — writers are stopped per §4)
ALTER TABLE IF EXISTS crypto_news_sources                 RENAME TO feed_sources;
ALTER TABLE IF EXISTS crypto_news_publisher_queue         RENAME TO feed_publisher_queue;
ALTER TABLE IF EXISTS crypto_news_publisher_keywords      RENAME TO feed_publisher_keywords;
ALTER TABLE IF EXISTS crypto_news_matching_config         RENAME TO feed_matching_config;
ALTER TABLE IF EXISTS crypto_news_publisher_llm_config    RENAME TO feed_publisher_llm_config;
ALTER TABLE IF EXISTS crypto_news_publisher_prompt_templates RENAME TO feed_publisher_prompt_templates;
ALTER TABLE IF EXISTS crypto_news_publisher_slot_state    RENAME TO feed_publisher_slot_state;
ALTER TABLE IF EXISTS crypto_news_publisher_throttle_state RENAME TO feed_publisher_throttle_state;
ALTER TABLE IF EXISTS crypto_news_ads                     RENAME TO feed_ads;
ALTER TABLE IF EXISTS crypto_news_ad_media                RENAME TO feed_ad_media;
ALTER TABLE IF EXISTS crypto_news_ad_media_library        RENAME TO feed_ad_media_library;
ALTER TABLE IF EXISTS crypto_news_ad_rotation_config      RENAME TO feed_ad_rotation_config;
ALTER TABLE IF EXISTS crypto_news_ad_rotation_state       RENAME TO feed_ad_rotation_state;
ALTER TABLE IF EXISTS crypto_news_ads_throttle_state      RENAME TO feed_ads_throttle_state;
-- Optional hygiene (functional WITHOUT these — indexes/constraints keep working under old names):
ALTER INDEX IF EXISTS idx_crypto_news_ads_enabled_order        RENAME TO idx_feed_ads_enabled_order;
ALTER INDEX IF EXISTS idx_crypto_news_ads_expires_at           RENAME TO idx_feed_ads_expires_at;
ALTER INDEX IF EXISTS idx_crypto_news_publisher_keywords_enabled     RENAME TO idx_feed_publisher_keywords_enabled;
ALTER INDEX IF EXISTS idx_crypto_news_publisher_keywords_template_id RENAME TO idx_feed_publisher_keywords_template_id;
ALTER INDEX IF EXISTS idx_crypto_news_sources_lifecycle_status RENAME TO idx_feed_sources_lifecycle_status;
ALTER INDEX IF EXISTS uq_crypto_news_ads_name                  RENAME TO uq_feed_ads_name;
ALTER INDEX IF EXISTS uq_crypto_news_publisher_prompt_templates_name RENAME TO uq_feed_publisher_prompt_templates_name;
ALTER INDEX IF EXISTS crypto_news_ad_media_library_content_hash_key  RENAME TO feed_ad_media_library_content_hash_key;
-- (pkey/idx_publisher_queue_* keep working; rename only the crypto-named ones above.
--  Staging additionally has idx_publisher_queue_status_queued_at — unprefixed, skip.)
ALTER TABLE IF EXISTS feed_ad_media RENAME CONSTRAINT fk_crypto_news_ad_media_ad TO fk_feed_ad_media_ad;
-- DOWN = mirror (feed_* → crypto_news_*), same IF EXISTS guards. Full text in the migration file.
```

Sequence/view/trigger check: NONE with crypto names on either backend DB (verified) → no DDL for them.
`typeorm_migrations` table: untouched (TypeORM records the new migration row itself).

## 3. Order: staging-first, then prod

1. **Phase A — staging** (`onchain_bot_staging` on `onchain-bot-postgres-staging`):
   merge migration + entity rename (§6), deploy via `deploy-staging.yml` (its one-off
   migration container runs BEFORE the new code boots — same release = lockstep),
   verify §5, soak ≥48h.
2. **Phase B — prod** (`alpha_meta_token_scanner` on `onchain-bot-postgres-production`):
   ONLY after §7 APPROVAL GATE. Same deploy path (`deploy.yml` migration one-off → recreate).
3. Ingestion envs: no DDL, no deploy needed for this rename (verify read-only post-check).

## 4. Backups + pre/post counts (per phase, per env)

1. Full backup FIRST via `scripts/backup-db.sh` (backend DB of the env); confirm
   `pg_restore --list` non-empty + sane size. Record dump path.
2. Pre-counts: `SELECT count(*)` per §1 table (staging: queue 36 / keywords 49 / prompts 1 /
   media 2 / library 6 / rest 1s + sources 0; prod: queue 36 / keywords 64 / prompts 2 /
   media 2 / library 8 / rest 1s + sources 0 — full tables in evidence log §B;
   re-take live at execution, values drift).
3. Stop writers: backend container of the env (publisher + enqueue crons live inside it).
   Ingestion-telegram can keep running (writes only its own DB). Confirm zero sessions on
   the backend DB: `SELECT pid FROM pg_stat_activity WHERE datname='<db>';` → 0 rows.
4. Run migration via the normal workflow (never hand-psql DDL on Oracle).
5. Post-counts: same 14 `SELECT count(*)` on `feed_*` names → must equal pre-counts exactly.
   Post-list: T1 query must return 0 rows; TF query must return the 14 `feed_*` names.

## 5. Verify (per phase)

- `:3030/api/health` (prod) / staging backend `/api/health` → up.
- Publisher path: `GET .../crypto-news-publisher/...` (or current prefix) queue depth == pre-count;
  one probe cycle logs `Found N matching messages`; queue drains (LLM/publishing flags as configured).
- Keywords/ads/matching/llm-config reads return pre-count rows (64/49 keywords etc.).
- SSE ingestion unaffected (separate DB) — `GET :3033/:3032/api/feed/sources` still 200.
- 24h error-log watch for `relation "crypto_news_*` (missed consumer) → §8 if seen.

## 6. Consumer flip order + TypeORM implications (lockstep, no dual-read)

- Backend is the ONLY reader/writer of these tables (consumers: `crypto-news-publisher`
  queue/keywords/llm-config/prompts/throttle/slot, `crypto-news-integration` matching-config,
  `crypto-news-ads` 6 tables, `threads` publisher reads queue-adjacent state, `telegram/shared`
  slot-state entity). feed-publisher app is NOT yet deployed → no second consumer to coordinate.
- Lockstep (SAME release, enforced by deploy workflows running migrations before boot):
  (a) migration §2, (b) all 14 `@Entity` names → `feed_*` (§1 AFTER column),
  (c) any raw-SQL/native-query string referencing `crypto_news_*`
  (`grep -rn crypto_news_ apps/backend/src --include=*.ts` must return only historical
  migration files + the new DOWN path after the flip).
- `synchronize` implications: staging/prod run `synchronize:false` + migrations
  (`database.module.ts` useMigrations; `data-source.ts` synchronize:false) → migration is the
  ONLY schema changer there. SAFE. Dev/test run `synchronize:true` → after pulling the
  entity rename, dev DBs auto-drop `crypto_news_*` + create `feed_*` (EMPTY — dev data loss
  is acceptable scratch, but NEVER point old code at a migrated DB: synchronize would
  RECREATE empty `crypto_news_*` tables next to `feed_*` → if seen, drop the ghosts).
- Dual-read strategy: NOT needed. Stop-the-world per env (queue ≤36 rows, drains in <1 cron
  tick) makes expand-migrate-contract overkill. If zero-downtime becomes a requirement later,
  fallback = `CREATE VIEW crypto_news_X AS SELECT * FROM feed_X` shim for one release (not planned).
- `PERSISTED_ENTITIES` (`persistence/entities.ts`): entity CLASSES unchanged, only their
  `@Entity({name})` — count stays 39-for-backend; the preservation spec count assertion needs
  NO update (names aren't asserted). Migration-spec: add `1880000000000-*.migration.spec.ts`
  mirroring `1875000000002` style (up renames, down restores, idempotent re-run).

## 7. APPROVAL GATE (before prod Phase B — REQUIRED)

Prod executes ONLY with ALL boxes checked, explicit human OK in the deploy thread:

- [ ] Phase A green on staging + 48h soak with zero `relation "crypto_news_` errors.
- [ ] Pre/post counts on staging matched exactly (14/14).
- [ ] Prod backup completed + `pg_restore --list` verified + dump path recorded.
- [ ] Downtime window announced (publisher paused during DDL — minutes, but queue cron stopped).
- [ ] Operator sign-off (name + timestamp): ************\_************

## 8. Rollback

- Data-shape rollback (preferred, same release window): run migration DOWN
  (`migration:revert` or down-SQL: 14 reverse `RENAME TO crypto_news_*` + index/constraint
  reverses) + redeploy previous backend image. Pre/post counts re-verified.
- Data-loss rollback: restore `scripts/backup-db.sh` dump to the env DB + redeploy previous
  image. Counts vs pre-counts.
- Staging-only anomaly → roll back staging only; prod gate stays closed.
- Ghost-table cleanup (dev only): `DROP TABLE IF EXISTS crypto_news_*` where synchronize
  recreated empties beside `feed_*`.

## 9. Post-execution docs (update in the executing PR)

- `DB.md`: rename the 14 tables in §crypto-news/feed + §ads; FIX the stale staging DB names
  (`alpha_meta_token_scanner_staging[_ingestion]` → `onchain_bot_staging[_ingestion]`,
  found live 2026-09-25); refresh counts.
- `.omo/runbooks/rename-onchain-bot-db.md`: correct STATUS (staging Phase A executed — live
  evidence 2026-09-25) if still marked NOT EXECUTED.
- Tramo 2 plan: consume §1 mapping for the backend→feed-publisher move.

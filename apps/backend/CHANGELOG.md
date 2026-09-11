# Changelog — backend

Manual changelog (see root `RELEASE-FLOW.md`). One entry per change, each citing
its real commit or PR from `.omo/evidence/task-3-manual-release-flow.tsv`.
No entry copies a squash body uncurated: re-emitted `BREAKING CHANGE:` footers
in later merges count zero times. Pre-`v1.3.0` history lives in git history and
`.omo/evidence/task-2-backup/` (todo 2 backup), not here.

## [Unreleased]

(none yet)

## [4.0.0] - 2026-09-11

Judged major for backend: two genuine breaking changes with cited evidence
below (`351fe02`, `352de6b`). A third footer from the same era (`b66beda`,
CryptoNewsSeeder removal) touches ingestion-service files only, so it is
NOT a backend breaking change and lives in the ingestion changelog (todo 10).
No `backend-v4.0.0` tag existed before this rewrite; this section is the basis
for tagging it (todos 12-13).

### ⚠ BREAKING CHANGES

* MTProto credentials must now be in ingestion-service ONLY. Backend MTProto
  mode is rollback-only; backend templates no longer carry a session
  (`351fe02`; first introduced on `dev` inside the range of merge `2b55629`).
* Seed-based channel subscription deprecated in favor of DB-driven approach.
  Backend serves channel lists over HTTP (`GET telegram-kol/identity/kols/active/ids`
  and crypto-news source ids) instead of static seeds (`352de6b`; via `2b55629`).

### Features

* Centralized ingestion service + multi-environment support, backend side:
  SSE consumer, channel filtering, media over HTTP (`f70d598`, PR #92;
  brought-in `e9ec7fc`).
* Multi-backend SSE broadcast support in backend (`f3c291c`;
  brought-in `bbb774c`, PR #119).
* Crypto-news sources ownership migrated to ingestion-service; backend reads
  on-demand and filters on-read instead of owning tables (`e01b937`;
  brought-in `4e07b1d`, PR #147). The re-emitted MTProto footer in that merge
  body is stray re-emission, not a new breaking change.
* Redis robustness + backend registration for multi-backend (`a9d4866`;
  brought-in `a104fff`, PR #134).

### Bug Fixes

* `queued_at` NULL-safe handling in publisher-queue migration, additive column,
  no incompatible schema change (`ba4a69f`, PR #150; brought-in `901a0a0`).
* Crypto-news seeder disabled + channel ID normalization (`1ed0d38`, PR #142;
  brought-in `ab56941`).
* Backend part of ingestion test/Gap-3-dedup/Husky/CI pass (`df79f68`, PR #154;
  brought-in `b031f32`).
* BACKEND_URL + TypeScript build-error fixes, 4 backend files (`79c04a8`,
  PRs #130+#132).
* Staging compose: relax deploy-ingestion client connection check
  (`9a4abd1`, PR #140; brought-in `cc1faa8`).
* Publisher ingestion URL fix, 2 backend files (`1376c08`, PRs #174+#175;
  brought-in `d00ba3a`).
* Staging migration runner + views fixes, 2 backend migration files
  (`652aecc`, PR #168; brought-in `f5c22e9`).
* Staging views fixes, 3 backend migrations/specs (`c5684d2`, PR #165;
  brought-in `7fb5b5c`).
* Prod migration idempotency + queue controller / process-next simplification,
  2 backend files (`d7a39ac`, PR #171; brought-in `75b624d`).
* Deploy cutover fixes, 2 backend files (`37ce399`, PR #162;
  brought-in `f801279`).
* Orphan-tables baseline migration deletion, 1 backend file (`3a929dc`,
  PR #190; brought-in `de5641d`).

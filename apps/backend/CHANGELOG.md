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
Tag `backend-v4.0.0` + GitHub release are cut from this section (todos 12-13).

### ⚠ BREAKING CHANGES

* MTProto credentials must now be in ingestion-service ONLY. Backend MTProto
  mode is rollback-only; backend templates no longer carry a session
  (`351fe02`; first introduced on `dev` inside the range of merge `2b55629`).
* Seed-based channel subscription deprecated in favor of DB-driven approach.
  Backend serves channel lists over HTTP (`GET telegram-kol/identity/kols/active/ids`
  and crypto-news source ids) instead of static seeds (`352de6b`; via `2b55629`).

### Bug Fixes

* Backend part of ingestion test/Gap-3-dedup/Husky/CI pass (`df79f68`, PR #154;
  brought-in `b031f32`).
* Deploy cutover fixes, 2 backend files (`37ce399`, PR #162;
  brought-in `f801279`).
* Staging views fixes, 3 backend migrations/specs (`c5684d2`, PR #165;
  brought-in `7fb5b5c`).
* Staging migration runner + views fixes, 2 backend migration files
  (`652aecc`, PR #168; brought-in `f5c22e9`).
* Prod migration idempotency + queue controller / process-next simplification,
  2 backend files (`d7a39ac`, PR #171; brought-in `75b624d`).
* Publisher ingestion URL fix, 2 backend files (`1376c08`, PRs #174+#175;
  brought-in `d00ba3a`).
* Orphan-tables baseline migration deletion, 1 backend file (`3a929dc`,
  PR #190; brought-in `de5641d`).

## [3.1.0] - 2026-09-06

Judged minor for backend (downgraded from the automation `3.0.0` major): one
backward-compatible feat + one additive fix, zero new breaking changes. The
`BREAKING CHANGE:` footer re-emitted inside brought-in `4e07b1d` is stray
re-emission, not a new incompatibility (same MTProto line already claimed once
in `[4.0.0]` above; counting it again would double-count one change).

### Features

* Crypto-news sources ownership migrated to ingestion-service; backend reads
  on-demand and filters on-read instead of owning tables (`e01b937`;
  brought-in `4e07b1d`, PR #147). The re-emitted MTProto footer in that merge
  body is stray re-emission, not a new breaking change.

### Bug Fixes

* `queued_at` NULL-safe handling in publisher-queue migration, additive column,
  no incompatible schema change (`ba4a69f`, PR #150; brought-in `901a0a0`).

## [2.1.0] - 2026-09-05

Judged minor for backend (downgraded from the automation `2.0.0` major): three
backward-compatible feats + three fixes, zero newly introduced breaking
changes. The two genuine backend breakings dated inside this era (`351fe02`
2026-08-30, `352de6b` 2026-09-02) are claimed exactly once in `[4.0.0]` above,
the judged release that ships them; repeating them here would double-count one
change (anti-dupe rule, `RELEASE-FLOW.md` section 5). All other merge-body
footers in this era are stray re-emission (carriers with HIT up to 96).

### Features

* Centralized ingestion service + multi-environment support, backend side:
  SSE consumer, channel filtering, media over HTTP (`f70d598`, PR #92;
  brought-in `e9ec7fc`).
* Multi-backend SSE broadcast support in backend (`f3c291c`;
  brought-in `bbb774c`, PR #119).
* Redis robustness + backend registration for multi-backend (`a9d4866`;
  brought-in `a104fff`, PR #134).

### Bug Fixes

* BACKEND_URL + TypeScript build-error fixes, 4 backend files (`79c04a8`,
  PRs #130+#132).
* Staging compose: relax deploy-ingestion client connection check
  (`9a4abd1`, PR #140; brought-in `cc1faa8`).
* Crypto-news seeder disabled + channel ID normalization (`1ed0d38`, PR #142;
  brought-in `ab56941`).

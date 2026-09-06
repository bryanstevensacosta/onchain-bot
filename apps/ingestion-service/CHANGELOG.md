# Changelog

## [2.0.0](https://github.com/bryanstevensacosta/onchain-bot/compare/v1.0.0...v2.0.0) (2026-09-06)


### ⚠ BREAKING CHANGES

* MTProto credentials must now be in ingestion-service ONLY
* **crypto-news:** MTProto credentials must now be in ingestion-service ONLY
* **ingestion:** MTProto credentials must now be in ingestion-service ONLY
* MTProto credentials must now be in ingestion-service ONLY
* **ingestion:** MTProto credentials must now be in ingestion-service ONLY
* **ingestion:** MTProto credentials must now be in ingestion-service ONLY
* **ci:** MTProto credentials must now be in ingestion-service ONLY
* MTProto credentials must now be in ingestion-service ONLY
* MTProto credentials must now be in ingestion-service ONLY
* **ci:** MTProto credentials must now be in ingestion-service ONLY
* MTProto credentials must now be in ingestion-service ONLY

### Features

* centralized ingestion service + multi-environment support ([#86](https://github.com/bryanstevensacosta/onchain-bot/issues/86)) ([e9ec7fc](https://github.com/bryanstevensacosta/onchain-bot/commit/e9ec7fcfc0d1a3ba4173532fbcb389f6393ffdc5))
* **ci:** bidirectional sync workflow + release-please fix + ingestion-service TelegramModule ([#109](https://github.com/bryanstevensacosta/onchain-bot/issues/109)) ([015a51b](https://github.com/bryanstevensacosta/onchain-bot/commit/015a51b12db5de3ae3ef1ce6c1d372fabac7ba6c))
* migrate crypto-news sources ownership to ingestion-service ([#147](https://github.com/bryanstevensacosta/onchain-bot/issues/147)) ([4e07b1d](https://github.com/bryanstevensacosta/onchain-bot/commit/4e07b1d07fbc6db8e3ce4de8bea3725c9d53d98f))
* Multi-backend SSE broadcast + ingestion improvements (clean merge) ([#119](https://github.com/bryanstevensacosta/onchain-bot/issues/119)) ([bbb774c](https://github.com/bryanstevensacosta/onchain-bot/commit/bbb774cf26c1942dfec5eedc1f37ee7ac2d2ee74))
* Redis robustness + Backend registration for multi-backend ([#134](https://github.com/bryanstevensacosta/onchain-bot/issues/134)) ([a104fff](https://github.com/bryanstevensacosta/onchain-bot/commit/a104fff00a00f10943ccecfd072b25deb24a9166))


### Bug Fixes

* **ci:** deploy permission fixes for automated workflows ([#122](https://github.com/bryanstevensacosta/onchain-bot/issues/122)) ([547b42b](https://github.com/bryanstevensacosta/onchain-bot/commit/547b42bb984b3b0560e531fa69465274da22dddf))
* **crypto-news:** disable seeder and add channel ID normalization ([#142](https://github.com/bryanstevensacosta/onchain-bot/issues/142)) ([ab56941](https://github.com/bryanstevensacosta/onchain-bot/commit/ab5694187b5f5e9bf7be8cf0c6d3c8cb6826b2b2))
* disable database in staging (TypeORM uuid-ossp hang) ([#112](https://github.com/bryanstevensacosta/onchain-bot/issues/112)) ([dfd8bac](https://github.com/bryanstevensacosta/onchain-bot/commit/dfd8bac68d69bca46a889626dba0923b33a2b813))
* **ingestion:** activeBackends counter + demote debug logs + document no-duplication ([#136](https://github.com/bryanstevensacosta/onchain-bot/issues/136)) ([43bc8d8](https://github.com/bryanstevensacosta/onchain-bot/commit/43bc8d82ac98a6e1d5639eed13778caea200e7ba))
* **ingestion:** add --ignore-scripts to npm ci in Dockerfile ([#102](https://github.com/bryanstevensacosta/onchain-bot/issues/102)) ([8e9514e](https://github.com/bryanstevensacosta/onchain-bot/commit/8e9514e09dd4423345a387f2b13dedf6315d02d6))
* **ingestion:** add Registry provider to MetricsModule - unblock Phase 9.1 ([#100](https://github.com/bryanstevensacosta/onchain-bot/issues/100)) ([c8498cb](https://github.com/bryanstevensacosta/onchain-bot/commit/c8498cb8a9b1ed4a945dbebfd7aac0d013345602))
* **ingestion:** add stub providers for TelegramClientManager and FloodWaitCounter ([#106](https://github.com/bryanstevensacosta/onchain-bot/issues/106)) ([de68536](https://github.com/bryanstevensacosta/onchain-bot/commit/de68536f8ec9d38d90c89412192ab52db3d595b6))
* **ingestion:** copy config directory in builder stage ([#105](https://github.com/bryanstevensacosta/onchain-bot/issues/105)) ([6d83d64](https://github.com/bryanstevensacosta/onchain-bot/commit/6d83d6472339dff52fb78fec117c2a54552d21e7))
* **ingestion:** disable husky in Docker build ([#91](https://github.com/bryanstevensacosta/onchain-bot/issues/91)) ([f4a59b8](https://github.com/bryanstevensacosta/onchain-bot/commit/f4a59b8458c0f514986a5d80ac73b5a85d11d006))
* **ingestion:** move ENV HUSKY=0 before COPY to invalidate cache ([480cbf5](https://github.com/bryanstevensacosta/onchain-bot/commit/480cbf54e3199669ca36acc5b14fff9865c4bd79))
* **ingestion:** resolve TypeScript build errors for Docker deployment ([#132](https://github.com/bryanstevensacosta/onchain-bot/issues/132)) ([0cd0dea](https://github.com/bryanstevensacosta/onchain-bot/commit/0cd0dea84a403dbab253deb67daaab5356e7d09a))
* **ingestion:** support BACKEND_URL for Docker networking ([#130](https://github.com/bryanstevensacosta/onchain-bot/issues/130)) ([5351a4d](https://github.com/bryanstevensacosta/onchain-bot/commit/5351a4dcd3242c5ecd0190bf7cd4981f892718db))
* **ingestion:** use new Registry() instead of globalRegistry ([#104](https://github.com/bryanstevensacosta/onchain-bot/issues/104)) ([4702839](https://github.com/bryanstevensacosta/onchain-bot/commit/4702839093c46cc016741191748f8eff34c1fe56))
* invalidate Docker cache for ingestion-service (cache bust v1) ([1bdb838](https://github.com/bryanstevensacosta/onchain-bot/commit/1bdb8387518363485b464301810087f08408209c))

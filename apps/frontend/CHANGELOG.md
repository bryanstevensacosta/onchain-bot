# Changelog

## [1.3.1](https://github.com/bryanstevensacosta/onchain-bot/compare/v1.3.0...v1.3.1) (2026-08-27)


### Bug Fixes

* **media:** complete 48h-&gt;24h frontend + HEVC ([#55](https://github.com/bryanstevensacosta/onchain-bot/issues/55)) ([70147d4](https://github.com/bryanstevensacosta/onchain-bot/commit/70147d4bcd7f889d2fdbe3a34534c22555b53969))


### Performance Improvements

* **media:** ingestion 24h-&gt;72h (cover queue backlog) + publisher TTL 0-&gt;7d ([#61](https://github.com/bryanstevensacosta/onchain-bot/issues/61)) ([f0996c4](https://github.com/bryanstevensacosta/onchain-bot/commit/f0996c40bf28fdd791c7f79697d198f8b954f10b))

## [1.3.0](https://github.com/bryanstevensacosta/onchain-bot/compare/v1.2.0...v1.3.0) (2026-08-25)


### Features

* bring crypto-news publisher, ads, dedup and prod frontend fixes to production ([#4](https://github.com/bryanstevensacosta/onchain-bot/issues/4)) ([41ca389](https://github.com/bryanstevensacosta/onchain-bot/commit/41ca389a2d3c4d681fcd8eeeeeb7ee81e97b8483))
* **consolidate:** merge token/market-data into chain/explorer + VIP Calls formatter example.md ([1221f21](https://github.com/bryanstevensacosta/onchain-bot/commit/1221f2112f1818cc2e34540464e6878581d27ea2))
* **crypto-news-page:** wire Add Source button + modal ([94eb193](https://github.com/bryanstevensacosta/onchain-bot/commit/94eb1931a53b57bb82f1f8045c0d6a4b92f80e8c))
* **crypto-news-publisher:** add requireImage filter per keyword ([f9d3217](https://github.com/bryanstevensacosta/onchain-bot/commit/f9d3217dd27adec0b05a9b869a9efc03af39b084))
* **crypto-news-publisher:** add system prompt to templates ([54e1f67](https://github.com/bryanstevensacosta/onchain-bot/commit/54e1f679413a825066a87b69b9d3a88c62d8bfc0))
* **crypto-news-publisher:** per-source keyword scoping ([868c691](https://github.com/bryanstevensacosta/onchain-bot/commit/868c691c6bdfd1d7af44eb66aa625d741946aa5e))
* **crypto-news-publisher:** prompt templates + llm config UI (Waves 1-3) ([0f5f99a](https://github.com/bryanstevensacosta/onchain-bot/commit/0f5f99a5763dfe81ce2b36d63547b4e10e994201))
* **crypto-news-publisher:** serve queue media and display image in frontend ([a0fde8d](https://github.com/bryanstevensacosta/onchain-bot/commit/a0fde8d1076cde5d9262e050c0073d98e7ef992f))
* **crypto-news-publisher:** show rawContent in queue view ([6a84849](https://github.com/bryanstevensacosta/onchain-bot/commit/6a84849d60a38be65809fabeecb847ea066e2f9a))
* **crypto-news:** add backend API and frontend /crypto-news page ([339bae0](https://github.com/bryanstevensacosta/onchain-bot/commit/339bae0e94373efe81663934ecf9656038856ac1))
* **crypto-news:** extract, persist and render Telegram message formatting entities ([103d06a](https://github.com/bryanstevensacosta/onchain-bot/commit/103d06af8a68a526a5e0f470feba121618167fcd))
* **crypto-news:** group media albums by Telegram groupedId ([10072f7](https://github.com/bryanstevensacosta/onchain-bot/commit/10072f7145ec78ea72909bee6a76eb4d8406ed07))
* **crypto-news:** ingest and display Telegram link previews (MessageMediaWebPage) ([fce582f](https://github.com/bryanstevensacosta/onchain-bot/commit/fce582fe1e97c224b48c540dd7eb6fe75c720bf0))
* **crypto-news:** ingest and display Telegram photo attachments ([26185b5](https://github.com/bryanstevensacosta/onchain-bot/commit/26185b5eacaa0e98a4e19509dbe65332f87dcb9f))
* **dashboard:** wire WsGateway + useEventStream for live KPI updates (C3 3b) ([6c9ec82](https://github.com/bryanstevensacosta/onchain-bot/commit/6c9ec825fa268672e901efe398e684c85d415187))
* **dev:** startup backfill + ticker fallback + token page fixes ([9fcce6a](https://github.com/bryanstevensacosta/onchain-bot/commit/9fcce6a9b91a4f7461e0e58b325f459023df109a))
* **docker:** add multi-stage Dockerfile for Vite frontend with nginx ([febfbc7](https://github.com/bryanstevensacosta/onchain-bot/commit/febfbc780c1600df6246d11a5ada53ce1a0b3787))
* **filters:** permissive defaults + FEAT-2 settings UI ([2ea1b51](https://github.com/bryanstevensacosta/onchain-bot/commit/2ea1b51c001cbd75cc895836cb222264764afff7))
* **frontend:** add AddCryptoNewsSourceModal feature ([1ce8a32](https://github.com/bryanstevensacosta/onchain-bot/commit/1ce8a32475fa0519719eb27b26031b33296ce0c9))
* **frontend:** add cryptoNews.sources.add ENDPOINTS entry ([2970996](https://github.com/bryanstevensacosta/onchain-bot/commit/29709962f8dc24d80f260aefce33335ab994c425))
* **frontend:** add free-text search filter combined with source filter ([1d71e3e](https://github.com/bryanstevensacosta/onchain-bot/commit/1d71e3e9df26343b873b474652619cfebc1ed263))
* **frontend:** add image lightbox overlay to crypto-news ([8203a74](https://github.com/bryanstevensacosta/onchain-bot/commit/8203a74df78314c457b80c4a1ae59f07ff4135af))
* **frontend:** add signalLabels utility with TDD coverage ([bebe829](https://github.com/bryanstevensacosta/onchain-bot/commit/bebe8294f45df9258547f40a3e60e2a7d330dd9f))
* **frontend:** add tracked-call entity slice for call-tracking BC ([ae9adc6](https://github.com/bryanstevensacosta/onchain-bot/commit/ae9adc6971b3ccb8628624e178e1a94e80e15317))
* **frontend:** add TrackedCallsWidget to dashboard ([d4c7830](https://github.com/bryanstevensacosta/onchain-bot/commit/d4c7830fb8c4d74c25c5711de3ca08863c437ad5))
* **frontend:** change 2-column split from 2/3-1/3 to exactly 50/50 ([dd8c38c](https://github.com/bryanstevensacosta/onchain-bot/commit/dd8c38ca1787e67942ab2f0aa5b26e27fa3044bd))
* **frontend:** consolidate /live into /tokens ([07d507f](https://github.com/bryanstevensacosta/onchain-bot/commit/07d507fef3e12b8b2f021e713bec26e5539f8776))
* **frontend:** crypto-news page pagination + filter + video display ([4f686c5](https://github.com/bryanstevensacosta/onchain-bot/commit/4f686c5c7ee8fd9d46ee676f9f9dd9d96a331855))
* **frontend:** invalidate /tokens on filter-decision WebSocket event ([5e28bda](https://github.com/bryanstevensacosta/onchain-bot/commit/5e28bdaedca69fcc8c9cf01f9f61d3ba3a4e275a))
* **frontend:** open crypto-news images in new tab on click ([a39ef7a](https://github.com/bryanstevensacosta/onchain-bot/commit/a39ef7ad4c5061d727f775c337c57f808717abc0))
* **frontend:** publisher keywords UI + queue view (Wave 5) ([b274d49](https://github.com/bryanstevensacosta/onchain-bot/commit/b274d4995248fad553a3f94ce3cf8a7008e3d7f3))
* **frontend:** queue pagination, dedup UI, model display ([ad8fe38](https://github.com/bryanstevensacosta/onchain-bot/commit/ad8fe3831ec872d9672dc8f943bd43ae5c160bef))
* **frontend:** show source handle/title and Telegram link in crypto-news page ([a6305ce](https://github.com/bryanstevensacosta/onchain-bot/commit/a6305ce486ebbfad85f173c933426bf49406e822))
* **frontend:** split crypto-news page into 2 columns (messages left, publisher right) ([913ae2c](https://github.com/bryanstevensacosta/onchain-bot/commit/913ae2c38e8948f5821a9134f0591914c4745b3a))
* **frontend:** TokenImage component with deterministic fallback (INV-5) ([611b2ca](https://github.com/bryanstevensacosta/onchain-bot/commit/611b2cad24999b92e36d3456b80ed01507bf9d2d))
* **frontend:** wire dashboard BC via useDashboardKpis (1 call vs 4) ([a9d9d7c](https://github.com/bryanstevensacosta/onchain-bot/commit/a9d9d7cff97221c35b537595a5889aa4c6fa782b))
* **kol-reputation:** configurable score formula + UI selector (Slice 3) ([c4fc561](https://github.com/bryanstevensacosta/onchain-bot/commit/c4fc56188aa47f98f13532bc3028b3463b69382c))
* **kol-reputation:** dynamic metrics shape (Slice 1) ([9066edc](https://github.com/bryanstevensacosta/onchain-bot/commit/9066edc3dd808b601f05c4bb0de43656ad85db8b))
* **kols:** add AddKOL feature slice with modal form ([3c5e72c](https://github.com/bryanstevensacosta/onchain-bot/commit/3c5e72c0f6bd4476ae18cb99919ffa9e28e3ed09))
* **kols:** integrate Add KOL button and modal into KolsPage ([11180cc](https://github.com/bryanstevensacosta/onchain-bot/commit/11180cc481f9663de4de98ffc08787203947ed89))
* production deployment infrastructure ([78613e9](https://github.com/bryanstevensacosta/onchain-bot/commit/78613e924b84e0c12d40653952cfa946dce9f1b2))
* symbol fallback chain from providers + link preview fix ([076ee15](https://github.com/bryanstevensacosta/onchain-bot/commit/076ee15fd7892c8019395961f567780bdfb0d04a))
* **ui:** add reusable Modal component ([f7a3ab7](https://github.com/bryanstevensacosta/onchain-bot/commit/f7a3ab73fd50a236509d76d16a3763a00ed70a9e))


### Bug Fixes

* add seedDefaultsIfEmpty, await knownKol port calls, expose trackedCalls endpoint ([19ab517](https://github.com/bryanstevensacosta/onchain-bot/commit/19ab51770fe3e4c4abcef338ad70c9c6f4b17383))
* **backend:** eliminate 3 KOL log warnings + defense-in-depth for invalid Solana addresses ([51711b0](https://github.com/bryanstevensacosta/onchain-bot/commit/51711b03e0eca9e8ad48ecf11ccaa68aef78ff08))
* **crypto-news:** image download with dcId/date, flood wait fix, proxy config ([1b28fd3](https://github.com/bryanstevensacosta/onchain-bot/commit/1b28fd30f588793c7e75bf3b26348f1b42ec0f09))
* **dashboard:** show correct KOL count instead of 0/50 ([7087116](https://github.com/bryanstevensacosta/onchain-bot/commit/70871163b724aa8f57e1b729af8385ade359c865))
* **extraction:** skip invalid rows in findRecent (same pattern as normalization) ([cf734ed](https://github.com/bryanstevensacosta/onchain-bot/commit/cf734ed23fb386e53ee1d21a8b41948fa5e36de0))
* **frontend:** adaptive media grid - square images side by side, mixed/rectangular stacked ([2592819](https://github.com/bryanstevensacosta/onchain-bot/commit/2592819f25e37af4b954cd3c17d4f8241dbb6cd3))
* **frontend:** add missing source dropdown in keyword create form ([e7c0d22](https://github.com/bryanstevensacosta/onchain-bot/commit/e7c0d22fef329c4abf5a3a72c04bf37d66083d27))
* **frontend:** avoid duplicate link preview image in media grid ([ce99ddb](https://github.com/bryanstevensacosta/onchain-bot/commit/ce99ddbb5ff4a8e247cfdbc4f5fc49593cb53807))
* **frontend:** consistent 2-column photo grid with full-image display ([57d58a6](https://github.com/bryanstevensacosta/onchain-bot/commit/57d58a6ddc2454b3f79b8d4786c2b02ee1ebe8c9))
* **frontend:** correct publishing endpoint paths (slash → hyphen) ([9f39719](https://github.com/bryanstevensacosta/onchain-bot/commit/9f39719d21226dcc07507a4d122cb0a9020869b4))
* **frontend:** group N consecutive media album messages, not just pairs ([f9a190d](https://github.com/bryanstevensacosta/onchain-bot/commit/f9a190d74844ce24b72cd56902b88356a7d5c45d))
* **frontend:** left-align images and text in crypto-news bubbles ([f41f1bf](https://github.com/bryanstevensacosta/onchain-bot/commit/f41f1bffccc38e9be9ce9cb5d5b1ac61252f7d1a))
* **frontend:** left-align images with object-left, responsive grid (1col mobile, 2col desktop) ([b9e9665](https://github.com/bryanstevensacosta/onchain-bot/commit/b9e966523c57886f86236f8b91d4763c0ea1db43))
* **frontend:** narrower container (max-w-xl, left-aligned), smaller images (max-h-56) ([5ea9b35](https://github.com/bryanstevensacosta/onchain-bot/commit/5ea9b355a21e61efc14378aaab8e8ca73afdbd0c))
* **frontend:** pagination on /kols + TopTokensTable Last seen ([f380a28](https://github.com/bryanstevensacosta/onchain-bot/commit/f380a28843db05b663218d3d7b443e00e4e90c29))
* **frontend:** re-center container with mx-auto ([c70a3f6](https://github.com/bryanstevensacosta/onchain-bot/commit/c70a3f685772c13ab692cef2e937ac5f70635cb9))
* **frontend:** remove name from /tokens rows — keep only $SYMBOL, address, chain, SCORE, verdict ([cf734ed](https://github.com/bryanstevensacosta/onchain-bot/commit/cf734ed23fb386e53ee1d21a8b41948fa5e36de0))
* **frontend:** reorder crypto-news post layout - images above text ([ddebe09](https://github.com/bryanstevensacosta/onchain-bot/commit/ddebe09683b582f675bcd1e70aea29f4a71c608c))
* **frontend:** restore REASON_TONE severity colors via centralized map ([b12365a](https://github.com/bryanstevensacosta/onchain-bot/commit/b12365a5720c2ddbfc390bfa0a8a5f2e13ac2a6d))
* **frontend:** set VITE_API_BASE_URL='' (same-origin) and proxy all backend routes in nginx; fix CORS errors on /tokens page ([b85241f](https://github.com/bryanstevensacosta/onchain-bot/commit/b85241f951a2c271418d49961ac13c2fd301aff2))
* **frontend:** settings import paths (bare -&gt; @/ prefix) ([fbf6818](https://github.com/bryanstevensacosta/onchain-bot/commit/fbf681883cbf875b81c92dfc443d5423a807fe17))
* **frontend:** style crypto-news posts as Telegram-style chat bubbles ([f6d7001](https://github.com/bryanstevensacosta/onchain-bot/commit/f6d70014901dd6c65b4304aff3bbec35c16034fc))
* **frontend:** use isSuccess instead of ?? for KPI data to avoid fallback to maxSafeChannels during WebSocket invalidation ([3176a3f](https://github.com/bryanstevensacosta/onchain-bot/commit/3176a3f2a1df3b782677a00adfa0d47d58e891a1))
* **frontend:** use pagedMessages instead of filteredMessages in grouping loop ([1c1e31c](https://github.com/bryanstevensacosta/onchain-bot/commit/1c1e31ca787754123d8b15cf9d1fd0d983696790))
* **frontend:** wire backend image proxy + image_urls backfill (INV-14) ([88298ac](https://github.com/bryanstevensacosta/onchain-bot/commit/88298ac32664d90161e2cd74447c56d6d6ca95f2))
* **ingestion:** wire DI for IngestionCoordinator cross-module dependencies ([830da1a](https://github.com/bryanstevensacosta/onchain-bot/commit/830da1a7d5c32f36582c1212c5f2ab8ce5c5823d))
* **kols:** set default lifecycleStatus to ACTIVE, rename Dormant to Deactivate, remove Block button ([e57de92](https://github.com/bryanstevensacosta/onchain-bot/commit/e57de924bee194e6929ed5f78ec2cb016add2603))
* **live-feed:** preload historical decisions on mount (INV-8) ([e2dd13a](https://github.com/bryanstevensacosta/onchain-bot/commit/e2dd13a109672a7eb5b1b0933f9e2f054e75aeac))
* **ops:** send kolId (not channelId) to /extraction/extract endpoint ([6d9c2d5](https://github.com/bryanstevensacosta/onchain-bot/commit/6d9c2d5357274ac3ed7c9549c6aa8b39471fe422))
* **tokens-explorer:** remove per-row canonical/snapshot queries (N+1) ([26b1c61](https://github.com/bryanstevensacosta/onchain-bot/commit/26b1c61654ca4818b04900c1d57fe399ed7252fb))

# Database inventory (plain language)

> Live re-query: 2026-09-25 via read-only `SELECT` on OracleDroplet + local dev.
> Refresh 2026-09-26: new-app sections below are declared from live entity
> reads (`@Entity` table names + columns), NOT from live `SELECT` — every new
> app still runs in-memory, so all new logical DBs hold 0 live tables.
> No secret values are stored in this file. Counts are approximate rows ("filas aprox").
> Table counts verified: prod backend 53 / prod ingestion 6 / staging backend 49 /
> staging ingestion 6 / kol-system staging 0.

## Server 1 — onchain-bot-postgres-production (OracleDroplet, production)

### Database `alpha_meta_token_scanner` — main production data (53 tables)

#### KOL pipeline (alpha-call path — moves to `kol-system` in Tramo 1)

- **extraction_results** — words and links pulled out of each KOL message.
  Columns: id, kol_id, message_id, occurred_at, contract_addresses, tickers, urls, created_at.
  Filas aprox prod: 147367 / staging: 0.
- **token_calls** — one row per token mention found in a KOL message.
  Columns: id, kol_id, message_id, occurred_at, contract, ticker, name, chart, liquidity_usd, market_cap_usd, fdv_usd, holders, confidence, created_at.
  Filas aprox prod: 12660 / staging: 0.
- **canonical_token_calls** — single merged record per token across all mentions.
  Columns: id, chain, address, ticker, name, chart, market_cap_usd, liquidity_usd, fdv_usd, holders, sources, mention_count, first_seen_at, last_seen_at, last_confidence, created_at, updated_at.
  Filas aprox prod: 5806 / staging: 0.
- **chain_detection_results** — which blockchain a contract address belongs to.
  Columns: id, address, resolved_chain, confidence, is_contract, scores, detected_at, created_at.
  Filas aprox prod: 0 / staging: 0.
- **token_snapshots** — market picture of a token at one moment (price, liquidity, holders).
  Columns: id, chain, address, pairs, primary_pair, price_usd, liquidity_usd, volume_24h_usd, market_cap_usd, fdv_usd, price_change_24h, holders, top10_holder_percent, symbol, name, image_urls, locked_liquidity_percent, burned_percent, sources, enriched_at, snapshot_completeness, provider_errors, created_at.
  Filas aprox prod: 5864 / staging: 0.
- **honeypot_analyses** — scam-safety check results per token (taxes, can sell or not).
  Columns: id, chain, address, risk, signals, buy_tax, sell_tax, transfer_tax, can_sell, can_buy, owner_can_drain, owner_renounced, is_proxy, analysis_source, analyzed_at, created_at.
  Filas aprox prod: 5385 / staging: 0.
- **token_classifications** — label given to each token (for example gem or risky).
  Columns: id, chain, address, classification, security_flag, confidence, risk_weight, highest_severity, snapshot_completeness, signals, classified_at, created_at.
  Filas aprox prod: 5378 / staging: 0.
- **token_scores** — points given to each token with the reasons broken down.
  Columns: id, chain, address, score, tier, classification, source_count, mention_count, avg_channel_reputation, scored_at, breakdown, created_at.
  Filas aprox prod: 5378 / staging: 0.
- **scoring_thresholds** — minimum and maximum points that decide each verdict.
  Columns: id, scope, min_score, max_score, decision.
  Filas aprox prod: 0 / staging: 0.
- **signals** — named warning or bonus signs used during scoring, with their penalty.
  Columns: id, code, name, penalty, risk_level, enabled, applies_to, created_at, updated_at.
  Filas aprox prod: 0 / staging: 0.
- **vip_call_approval_decisions** — yes or no decision per candidate VIP call with reasons.
  Columns: id, chain, address, verdict, score, classification, reasons, decided_at, created_at.
  Filas aprox prod: 5378 / staging: 0.
- **vip_published_calls** — published VIP calls with result.
  Columns: id, chain, address, ticker, score, tier, classification, message, status, published_channel_ids, failed_channel_ids, published_at, mc_at_call, telegram_message_id, reserved_at, correlation_id, failed_reason.
  Filas aprox prod: 2686 / staging: 0.
- **published_calls** — older copy of published calls (production only, kept for history).
  Columns: id, chain, address, ticker, score, tier, classification, message, status, published_channel_ids, failed_channel_ids, published_at, mc_at_call, telegram_message_id, reserved_at, correlation_id, failed_reason.
  Filas aprox prod: 5. Staging: table does not exist.
- **kol_reputations** — reputation points per KOL channel.
  Columns: kol_id, score, metrics, confidence, last_evaluated_at.
  Filas aprox prod: 92 / staging: 46.
- **kols_backup_20260923** — one-time safety copy of the KOL channel list (production only).
  Columns: kol_id, handle, title, is_active, lifecycle_status, last_ingested_at, added_at, updated_at.
  Filas aprox prod: 46. Staging: table does not exist.
- **settings_filters** — on or off switches and limits for the pipeline.
  Columns: id, type, value, numeric_value, scope, enabled, notes, created_at, updated_at.
  Filas aprox prod: 4 / staging: 4.
- **settings_presets** — named saved sets of settings you can switch between.
  Columns: id, name, description, snapshot, is_active, created_at, updated_at, created_by.
  Filas aprox prod: 1 / staging: 1.
- **settings_audit_log** — history of who changed which setting and when.
  Columns: id, entity_type, entity_id, action, before, after, source_ip, created_at.
  Filas aprox prod: 0 / staging: 0.
- **achievement_thresholds** — price goals watched per call (for example doubling).
  Columns: id, multiple.
  Filas aprox prod: 99 / staging: 99.
- **vip_notified_achievements** — record of goal alerts already sent for VIP calls.
  Columns: id, call_id, threshold, notified_at, telegram_message_id.
  Filas aprox prod: 15246 / staging: 0.
- **notified_achievements** — older copy of sent goal alerts (production only).
  Columns: id, call_id, threshold, notified_at, telegram_message_id.
  Filas aprox prod: 0. Staging: table does not exist.
- **backfill_messages** — messages re-loaded by hand to fill gaps (production only).
  Columns: event_id, timestamp, channel_id, message_id, payload.
  Filas aprox prod: 0. Staging: table does not exist.

#### Crypto-news / feed (moves to `feed-publisher` in Tramo 2, tables renamed `crypto_news_*` -> `feed_*` per P35)

- **crypto_news_sources** — news channels followed (production copy; staging has none yet).
  Columns: channel_id, handle, title, is_active, lifecycle_status, added_at, updated_at.
  Filas aprox prod: 0 / staging: 0.
- **crypto_news_publisher_queue** — news items waiting to be published, with progress.
  Columns: id, channel_id, message_id, raw_content, raw_title, image_path, grouped_id, message_received_at, keyword_template_id, status, published_at, telegram_message_id, last_error, attempts, trace_id, image_paths, matched_keyword_ids, generated_content, generated_system_prompt, generated_user_prompt, generated_temperature, generated_reasoning_effort, generated_model, blocked_reason, duplicate_of_channel_id, duplicate_of_message_id, duplicate_of_entry_id, formatting_entities, queued_at.
  Filas aprox prod: 36 / staging: 36.
- **crypto_news_publisher_keywords** — allowed trigger words that select news.
  Columns: id, phrase, case_sensitive, template_id, enabled, require_image, created_at, source_channel_ids, and_group_id, match_mode.
  Filas aprox prod: 64 / staging: 49.
- **blacklist_phrases** — forbidden phrases that block a news item.
  Columns: id, phrase, case_sensitive, match_mode, source_channel_ids, and_group_id, require_image, enabled, created_at.
  Filas aprox prod: 12 / staging: 11.
- **channel_content_filter_configs** — find-and-replace text cleanups applied per channel.
  Columns: id, channel_id, pattern, replacement, flags, is_active, priority, created_at, updated_at.
  Filas aprox prod: 8 / staging: 0.
- **crypto_news_matching_config** — master switch for matching news to keywords.
  Columns: id, enabled, updatedAt.
  Filas aprox prod: 1 / staging: 1.
- **crypto_news_publisher_llm_config** — writing robot settings and daily limits.
  Columns: id, default_template_id, target_channel, daily_cap, daily_reset_utc_hour, random_delay_min_ms, random_delay_max_ms, llm_max_attempts, updated_at, reject_non_latin, llm_enabled, publishing_enabled.
  Filas aprox prod: 1 / staging: 1.
- **crypto_news_publisher_prompt_templates** — reusable writing instructions for the robot.
  Columns: id, name, description, model, max_tokens, temperature, reasoning_effort, prompt_text, system_prompt_text, created_at, updated_at, supports_vision.
  Filas aprox prod: 2 / staging: 1.
- **dedup_fingerprints** — fingerprints used to spot repeated news.
  Columns: id, fingerprint_type, fingerprint_value, source, channel_id, message_id, urls_hashes, tokens, numbers, entities, cashtags, embedding, referenced_entry_id, referenced_channel_id, referenced_message_id, created_at, content.
  Filas aprox prod: 1548 / staging: 4214.
- **crypto_news_publisher_slot_state** — when the last publishing slot ran.
  Columns: id, last_scope, last_publish_at, min_seconds_between_slots, updated_at.
  Filas aprox prod: 1 / staging: 1.
- **crypto_news_publisher_throttle_state** — brake that slows publishing down.
  Columns: id, last_publish_at, updated_at.
  Filas aprox prod: 1 / staging: 1.
- **dead_letter_queue** — failed messages parked aside for review.
  Columns: id, channel_id, message_id, failure_reason, failed_payload, failed_at, retry_count, status.
  Filas aprox prod: 0 / staging: 0.

#### Ads / scheduling (moves to `feed-publisher/scheduling`, ads renamed scheduling per P36)

- **crypto_news_ads** — sponsored messages library.
  Columns: id, name, body, enabled, order, times_published, consecutive_failures, last_published_at, expires_at, expiration_action, format, video_media_id, album_media_ids, buttons, created_at, updated_at, image_media_id.
  Filas aprox prod: 2 / staging: 2.
- **crypto_news_ad_media** — pictures or video attached to each sponsored message.
  Columns: id, ad_id, file_path, mime_type, file_size, created_at.
  Filas aprox prod: 2 / staging: 2.
- **crypto_news_ad_media_library** — shared shelf of reusable media files.
  Columns: id, file_path, content_hash, original_file_name, mime_type, file_size, created_at.
  Filas aprox prod: 8 / staging: 6.
- **crypto_news_ad_rotation_config** — how often a sponsored message appears.
  Columns: id, enabled, every_n_posts, min_minutes_between_ads, created_at, updated_at.
  Filas aprox prod: 1 / staging: 1.
- **crypto_news_ad_rotation_state** — counter of posts since the last sponsored message.
  Columns: id, posts_since_last_ad, last_ad_id, last_ad_published_at, updated_at.
  Filas aprox prod: 1 / staging: 1.
- **crypto_news_ads_throttle_state** — brake that slows sponsored messages down.
  Columns: id, last_publish_at, updated_at.
  Filas aprox prod: 1 / staging: 1.

#### Threads (moves to `feed-publisher/threads` in Tramo 2)

- **threads_keywords** — allowed trigger words for Threads posts.
  Columns: id, phrase, case_sensitive, source_channel_ids, template_id, enabled, and_group_id, require_image, match_mode, created_at.
  Filas aprox prod: 0 / staging: 0.
- **threads_blacklist_phrases** — forbidden phrases for Threads posts.
  Columns: id, phrase, case_sensitive, match_mode, source_channel_ids, and_group_id, require_image, enabled, created_at.
  Filas aprox prod: 0 / staging: 0.
- **threads_llm_configs** — writing robot settings for Threads.
  Columns: id, default_template_id, llm_enabled, publishing_enabled, reject_non_latin, daily_cap, daily_reset_utc_hour, random_delay_min_ms, random_delay_max_ms, llm_max_attempts, updated_at.
  Filas aprox prod: 0 / staging: 0.
- **threads_matching_configs** — master switch for Threads matching.
  Columns: id, enabled, updatedAt.
  Filas aprox prod: 1 / staging: 1.
- **threads_prompt_templates** — reusable writing instructions for Threads.
  Columns: id, name, description, model, supports_vision, max_tokens, temperature, reasoning_effort, prompt_text, system_prompt_text, created_at, updated_at.
  Filas aprox prod: 0 / staging: 0.
- **threads_queue_entries** — Threads posts waiting to be published.
  Columns: id, trace_id, channel_id, message_id, raw_content, raw_title, image_path, image_paths, grouped_id, message_received_at, queued_at, matched_keyword_ids, keyword_template_id, formatting_entities, status, published_at, telegram_message_id, last_error, attempts, generated_content, generated_system_prompt, generated_user_prompt, generated_temperature, generated_reasoning_effort, generated_model, blocked_reason, duplicate_of_channel_id, duplicate_of_message_id, duplicate_of_entry_id.
  Filas aprox prod: 0 / staging: 0.
- **threads_oauth_tokens** — login tokens for posting to Threads (values never shown here).
  Columns: id, access_token, threads_user_id, obtained_at, expires_in_s, updated_at.
  Filas aprox prod: 0 / staging: 0.
- **threads_throttle_states** — brake that slows Threads posting down.
  Columns: id, last_publish_at, updated_at.
  Filas aprox prod: 0 / staging: 0.

#### Tracking (call follow-up — moves to `kol-system/tracking` in Tramo 1)

- **monitored_calls** — published calls being watched over time.
  Columns: id, call_id, chain, address, mc_at_call, published_at, last_evaluated_at.
  Filas aprox prod: 1096 / staging: 0.
- **tracked_published_calls** — tracked calls with current price and goals hit.
  Columns: id, kol_id, chain, address, ticker, mc_at_publish, mc_now, milestones_hit, max_milestone, price_drop_percent, published_at, last_updated_at, is_active, created_at, updated_at.
  Filas aprox prod: 0 / staging: 0.
- **call_performances** — final result per watched call (win or loss, peak gain).
  Columns: id, kol_id, token_id, outcome, mc_at_call, ath_multiple, call_timestamp, evaluated_at, created_at.
  Filas aprox prod: 0 / staging: 0.
- **call_evaluation_jobs** — scheduled check-ups waiting to run per call.
  Columns: id, kol_id, chain, address, horizon, status, attempts, last_error, call_timestamp, mc_at_call, scheduled_at, completed_at, created_at.
  Filas aprox prod: 0 / staging: 0.

#### System (stays with each database, not moved)

- **typeorm_migrations** — list of database updates already applied.
  Columns: id, timestamp, name.
  Filas aprox prod: 22 / staging: 22.

### Database `alpha_meta_token_scanner_ingestion` — raw Telegram feed, production (6 tables)

Owned by ingestion-telegram. Already uses the new `telegram_feed_*` names, so no rename is needed in the refactor.

- **telegram_feed_sources** — Telegram channels watched for news, with kind and status.
  Columns: channel_id, handle, title, type, is_active, lifecycle_status, last_ingested_at, added_at, updated_at.
  Filas aprox: 59.
- **telegram_feed_messages** — raw messages exactly as received from Telegram.
  Columns: id, channel_id, message_id, title, content, published_at, ingested_at, link_preview_url, link_preview_title, link_preview_description, link_preview_site_name, message_entities, grouped_id, type.
  Filas aprox: 16545.
- **telegram_feed_message_media** — pictures and video attached to raw messages.
  Columns: id, message_id, media_index, type, file_path, mime_type, file_size, created_at.
  Filas aprox: 201.
- **backfill_messages** — messages re-loaded by hand to fill gaps.
  Columns: event_id, timestamp, channel_id, message_id, payload.
  Filas aprox: 0.
- **channel_content_filter_configs** — find-and-replace text cleanups applied per channel.
  Columns: id, channel_id, pattern, replacement, flags, is_active, priority, created_at, updated_at.
  Filas aprox: 0.
- **typeorm_migrations** — list of database updates already applied.
  Columns: id, timestamp, name.
  Filas aprox: 6.

## Server 2 — onchain-bot-postgres-staging (OracleDroplet, staging)

### Database `alpha_meta_token_scanner_staging` — staging twin of the main data (49 tables)

Same table list and columns as production except 4 tables that exist only in
production: `backfill_messages`, `kols_backup_20260923`, `notified_achievements`,
`published_calls`. Column lists are the same as production (see above); staging
row counts ("filas aprox") are listed next to production counts per table above
and repeated here for quick reading: achievement_thresholds 99, blacklist_phrases 11,
call_evaluation_jobs 0, call_performances 0, canonical_token_calls 0,
chain_detection_results 0, channel_content_filter_configs 0, crypto_news_ad_media 2,
crypto_news_ad_media_library 6, crypto_news_ad_rotation_config 1,
crypto_news_ad_rotation_state 1, crypto_news_ads 2, crypto_news_ads_throttle_state 1,
crypto_news_matching_config 1, crypto_news_publisher_keywords 49,
crypto_news_publisher_llm_config 1, crypto_news_publisher_prompt_templates 1,
crypto_news_publisher_queue 36, crypto_news_publisher_slot_state 1,
crypto_news_publisher_throttle_state 1, crypto_news_sources 0, dead_letter_queue 0,
dedup_fingerprints 4214, extraction_results 0, honeypot_analyses 0, kol_reputations 46,
monitored_calls 0, scoring_thresholds 0, settings_audit_log 0, settings_filters 4,
settings_presets 1, signals 0, threads tables all 0 except threads_matching_configs 1,
token_calls 0, token_classifications 0, token_scores 0, token_snapshots 0,
tracked_published_calls 0, typeorm_migrations 22, vip_call_approval_decisions 0,
vip_notified_achievements 0, vip_published_calls 0.

### Database `alpha_meta_token_scanner_staging_ingestion` — raw Telegram feed, staging (6 tables)

Same 6 tables and columns as the production ingestion database (see above).
Filas aprox: backfill_messages 0, channel_content_filter_configs 0,
telegram_feed_message_media 663, telegram_feed_messages 1799, telegram_feed_sources 59,
typeorm_migrations 6.

## Server 3 — onchain-bot-kol-system-postgres-staging (OracleDroplet, staging)

### Database `onchain_bot_kol_system_staging` — home of kol-calls + kol-calls-publisher (0 live tables)

Empty on purpose: the kol-calls app (Tramo 1, renamed `kol-system` ->
`kol-calls` 2026-09-26, DB names unchanged) and kol-calls-publisher (P51
split 2026-09-26, same logical DB initially, split later) both run on
in-memory repos — their TypeORM persistence is still unwired, so no tables
exist yet. Intended tables are listed under "New app databases" below.
Nothing to list yet.

## New app databases (declared in code, 0 live tables each)

Every app below owns one logical DB per env (`onchain_bot_<app>` prod +
dev, `onchain_bot_<app>_staging` staging, same server as the backend DB per
env). All persistence shapes are UNWIRED (in-memory repos are live) unless
noted — the tables below come from live entity reads, so each "table" is
the declared future shape, not a live row store.

### Database `onchain_bot_kol_system[_staging]` — kol-calls hot path (Tramo 1)

Owner: `apps/kol-calls/` (renamed from `kol-system` 2026-09-26; DB names
unchanged). No `@Entity` decorators exist yet — repos are in-memory,
TypeORM lands with the persistence todo. Table names are the spec intent
from `apps/kol-calls/AGENTS.md`.

- **extraction_candidates** — one row per contract mention in a KOL tip.
  Columns: id, kolId, messageId, contractIndex, occurredAt, contractAddress, tickers, urls, handle, channelUrl, channelId, channelTitle.
- **parsed_calls** — one structured row per candidate (ticker, name, chart).
  Columns: id, kolId, messageId, contractIndex, occurredAt, contractAddress, ticker, name, chart, handle, channelId.
- **normalized_mentions** — one filed row per mention, never merged.
  Columns: id, kolId, messageId, contractIndex, occurredAt, contractAddress, ticker, name, chart, handle, channelId.
- **mention_snapshots** — market picture at capture plus four clocks.
  Columns: mentionId, kolId, messageId, contractIndex, contractAddress, chain, occurred_at_telegram, ingested_at_kol, enriched_at (= snapshot_at), priceUsd, liquidityUsd, volume24hUsd, marketCapUsd, fdvUsd, priceChange24h, holders, top10HolderPercent, symbol, name, lockedLiquidityPercent, burnedPercent.
- **tracked_mentions** — first-seen tracker per (caller, contract).
  Columns: id, kolId, chain, address, firstSeenAt, firstMcAt, lastCallMcAt, lastSeenAt, lastMentionId, timesCalled.
- **kol_window_stats** — precomputed ranking rows per (caller, window).
  Columns: id, caller, window, totalX, callsCount, strongCalls.

### Database `onchain_bot_kol_system[_staging]` (shared) — kol-calls-publisher (P51)

Owner: `apps/kol-calls-publisher/` (split 2026-09-26; SAME logical DB as
kol-calls initially, split later; HTTP `:3060`/`:3061`/`:3062`). Same
unwired state: domain entities only, in-memory repos, no `@Entity` yet.

- **scored_calls** — score 0-100 per passing mention with reasons.
  Columns: mentionId, kolId, messageId, contractIndex, chain, address, score, avgKolReputation, breakdown, scoredAt, tier.
- **publishing_templates** — per-template channel picker, labels, ranking, bot link.
  Columns: id, name, kolSourceIds, minVisibleScore, gemMinScore, gemPatterns, rankingStrategy, rankingLimit, rankingWeights, scoringConfig, botId, channelTarget, active, ownerId.
- **telegram_bots** — reusable bot catalog, token as ciphertext only.
  Columns: id, label, encryptedToken, createdAt, updatedAt.
- **call_approvals** — accept-or-reject row per (template, mention).
  Columns: id, templateId, mentionId, kolId, chain, address, ticker (may be empty here), score, status, reason, decidedBy, decidedAt, createdAt.
- **publishing_jobs** — one send attempt per approved mention (ticker never empty).
  Columns: id, templateId, mentionId, ticker, chain, address, channelTarget, message, status, telegramMessageId, failedReason, createdAt, finalizedAt.

### Database `onchain_bot_feed_publisher[_staging]` — feed-publisher (Tramo 2)

Owner: `apps/feed-publisher/` (HTTP `:3040`/`:3041`/`:3042`, dev pg
`:5436`). TypeORM shapes exist but are UNWIRED (GAP-1, in-memory live) —
except `feed_content_templates`, which is a shape stub without `@Entity`.

- **feed_publisher_queue** — news items waiting to be published, with progress.
  Columns: id, contentType, channelId, messageId, rawContent, rawTitle, imagePaths, groupedId, messageReceivedAt, queuedAt, matchedKeywordIds, keywordTemplateId, status, attempts, publishedAt, telegramMessageId, generatedContent, lastError, blockedReason, duplicateOfChannelId, duplicateOfMessageId, duplicateOfEntryId.
- **feed_publisher_keywords** — allowed trigger words that select news.
  Columns: id, phrase, caseSensitive, sourceChannelIds, templateId, enabled, andGroupId, requireMedia, matchMode, createdAt.
- **feed_publisher_blacklist_phrases** — forbidden phrases that block a news item.
  Columns: id, phrase, caseSensitive, matchMode, sourceChannelIds, andGroupId, requireMedia, enabled, createdAt.
- **channel_content_filter_configs** — find-and-replace text cleanups per channel (name kept, no rename).
  Columns: id, channelId, pattern, replacement, flags, isActive, priority, createdAt, updatedAt.
- **feed_publisher_matching_config** — master switch for matching news to keywords.
  Columns: id, enabled, updatedAt.
- **feed_llm_config** — writing robot settings and daily limits (single row).
  Columns: id, defaultTemplateId, targetChannel, llmEnabled, publishingEnabled, rejectNonLatin, dailyCap, dailyResetUtcHour, randomDelayMinMs, randomDelayMaxMs, llmMaxAttempts, updatedAt.
- **feed_prompt_templates** — reusable writing instructions, global catalog.
  Columns: id, name, description, contentType, model, supportsVision, maxTokens, temperature, reasoningEffort, promptText, systemPromptText, createdAt, updatedAt.
- **dedup_fingerprints** — fingerprints used to spot repeated news (name kept, plain table, no vector extension).
  Columns: id, fingerprintType, fingerprintValue, source, channelId, messageId, contentHash, urlHashes, tokens, numbers, entities, cashtags, content, embedding, referencedEntryId, createdAt.
- **feed_threads** — Threads post containers with progress.
  Columns: id, status, messagesPublished, lastPublishedMessageIndex, attempts, failureReason, nextAttemptAt, createdAt, updatedAt.
- **feed_thread_messages** — single posts inside a Threads container.
  Columns: id, threadId, idx, content, mediaUrls, delaySeconds, publishedAt, remoteId.
- **feed_content_templates** (future stub, no `@Entity` yet) — reusable publishing setups.
  Columns: id, name, active, sourceIds, keywordIds, promptTemplateId, targets.
- Template bot catalog + publishing sessions — in-memory only, no table shape declared yet.

### Database `onchain_bot_scheduling[_staging]` — publishing-queue (Tramo 2 follow-up)

Owner: `apps/publishing-queue/` (moved from feed-publisher via `git mv`
2026-09-26; HTTP `:4080`/`:4081`/`:4082`, dev pg `:5442`). Shapes UNWIRED
(GAP-1, in-memory live).

- **feed_scheduled_ads** — sponsored messages library (renamed ads -> scheduling per P36).
  Columns: id, name, body, format, imageMediaId, videoMediaId, albumMediaIds, buttons, enabled, order, timesPublished, consecutiveFailures, lastPublishedAt, expiresAt, expirationAction, createdAt, updatedAt.
- **feed_scheduled_ad_media** — pictures or video attached to each sponsored message.
  Columns: id, adId, filePath, mimeType, fileSize, createdAt.
- **feed_ad_media_library** — shared shelf of reusable media files.
  Columns: id, filePath, contentHash, originalFileName, mimeType, fileSize, createdAt.
- **feed_scheduling_config** — how often a sponsored message appears, per target (single row).
  Columns: id, enabled, everyNPosts, minMinutesBetweenAds, telegramPublishDelayMs, telegramDailyCap, threadsPublishDelayMs, threadsDailyCap, createdAt, updatedAt.
- **feed_scheduling_state** — counters and daily tallies per target (single row).
  Columns: id, postsSinceLastAd, telegramLastAdId, telegramLastPublishedAt, telegramPublishedToday, telegramDayKey, threadsLastAdId, threadsLastPublishedAt, threadsPublishedToday, threadsDayKey, updatedAt.
- **scheduled_posts** — one-shot and recurring contract posts, replay-safe.
  Columns: id, sessionId, binding, content, scheduleKind, idempotencyKey, state, messageId, firedAt, reason, lastFiredAt, createdAt, updatedAt.

### Database `onchain_bot_market_data[_staging]` — market-data (Tramo 3)

Owner: `apps/market-data/` (HTTP `:4000`/`:4001`/`:4002`, dev pg `:5438`).
0 tables declared — no entities exist; persistence (address snapshots +
`api_keys`) lands with todo 3. HTTP answers are computed live, nothing is
stored.

### Database `onchain_bot_dexter[_staging]` — dexter-onchain-bot (Tramo 3 final phase)

Owner: `apps/dexter-onchain-bot/` (HTTP `:4060`/`:4061`/`:4062`, dev pg
`:5440`). 0 tables — chat groups + chat settings run in-memory
(TypeORM intentionally not moved); the DBs are provisioned but unwired.

- **chat_groups** (planned, no shape yet) — chats the lookup bot has seen.
  Columns: id, telegramChatId, telegramChatType, title, telegramChatUsername, createdAt, lastSeenAt.
- **chat_settings** (planned, no shape yet) — per-chat trade buttons and display options.
  Columns: chatGroupId, enabledTradeButtons, tradeButtonsPosition, tradeButtonsLimit, emojiMode, groupMode, autoResponder, priceMode, updatedAt.

### Database `onchain_bot_ai_ml[_staging]` — ai-ml (shared service)

Owner: `apps/ai-ml/` (HTTP `:4090`/`:4091`/`:4092`, dev pg `:5444`). One
declared shape, UNWIRED (in-memory live); keys, audits and usage stay
in-memory.

- **ai_ml_prompt_templates** — versioned global writing-instruction catalog.
  Columns: id, name, version, content, systemContent, variables, contentType, isActive, createdAt, updatedAt.

### Database `onchain_bot_bots[_staging]` — telegram-bots-gateway (shared service)

Owner: `apps/telegram-bots-gateway/` (HTTP `:4070`/`:4071`/`:4072`).
One declared shape, scaffold-only (no migration, in-memory repo live).

- **bot_vault** — bot tokens as ciphertext only, never plaintext.
  Columns: id, label, token (ciphertext), owner_app, created_at, rotated_at.

### Database `onchain_bot_threads[_staging]` — threads-publisher

Owner: `apps/threads-publisher/` (HTTP `:4100`/`:4101`/`:4102`, dev pg
`:5446`, dev redis `:6393`). Shapes below come from live reads of
`src/threads/domain/` (8 domain entities) + `src/feed-threads/domain/`
(`FeedThread`); persistence is UNWIRED (in-memory repos live), so the
logical DBs hold 0 live tables — each "table" is the declared future
shape, not a live row store.

- **threads_keywords** — allowed trigger words for Threads posts.
  Columns: id, phrase, matchMode, channelId, requireMedia, templateId.
- **threads_blacklist_phrases** — forbidden phrases for Threads posts.
  Columns: id, phrase.
- **threads_llm_configs** — writing robot settings and daily limits (single row id=1).
  Columns: llmEnabled, publishingEnabled, rejectNonLatin, dailyCap, llmMaxAttempts, model (from `THREADS_LLM_MODEL`, no provider pinned in code).
- **threads_matching_configs** — master switch for Threads matching (single row).
  Columns: enabled.
- **threads_oauth_tokens** — login tokens for posting to Threads, single row id=1 (values never shown here).
  Columns: id, accessToken, threadsUserId, obtainedAt, expiresInS.
- **threads_prompt_templates** — reusable writing instructions for Threads (seed threads-default).
  Columns: id, name, content, model, maxTokens, temperature, vision.
- **threads_queue_entries** — Threads posts waiting to be published, 6-state lifecycle.
  Columns: id, channelId, messageId, rawContent, status (PENDING, SCHEDULED, PUBLISHING, PUBLISHED, FAILED, BLOCKED), queuedAt, matchedKeywordIds, generatedContent, lastError, publishedRemoteId.
- **threads_throttle_states** — brake that slows Threads posting down.
  Columns: lastPublishedAt, dayKey, publishedToday.
- **feed_threads** — Threads post containers with progress (DRAFT to QUEUED to IN_PROGRESS to COMPLETED, PARTIAL resume, FAILED terminal).
  Columns: id, status, messages (content, delayMs), messagesPublished, failureReason.

## Local dev (laptop)

Main dev database `alpha_meta_token_scanner`: 48 tables — the same set as staging
minus `crypto_news_sources`, with the same columns as listed above. Mostly empty
(filas aprox: achievement_thresholds 99, settings_filters 4, settings_presets 1,
matching configs 1 each, prompt templates 1, typeorm_migrations 22, everything
else 0). No local ingestion database was found.

## What the refactor will move or rename (no execution, plan only)

- KOL pipeline tables (`extraction_results`, `token_calls`, `canonical_token_calls`,
  `chain_detection_results`, `token_snapshots`, `honeypot_analyses`,
  `token_classifications`, `token_scores`, `vip_call_approval_decisions`,
  `vip_published_calls`, `kol_reputations`, `monitored_calls`,
  `tracked_published_calls`, `call_performances`, `call_evaluation_jobs`,
  plus settings and achievements helpers) move to the new `kol-system` database
  (`onchain_bot_kol_system[_staging]`) in Tramo 1, under the new per-mention
  shapes (`extraction_candidates`, `parsed_calls`, `normalized_mentions`,
  `mention_snapshots`, `scored_calls`, `call_approvals`, `publishing_jobs`,
  `tracked_mentions`, `kol_window_stats`, `publishing_templates`,
  `telegram_bots`). The `kol-identity` profile idea
  was dropped (P4): channel lists stay in ingestion-telegram.
  (`kol-system` renamed `kol-calls` 2026-09-26, DB names unchanged;
  scoring/templates/approval/publishing moved to `kol-calls-publisher`,
  same DB initially.)
- Feed tables (`crypto_news_*` in the backend) move to the new `feed-publisher`
  database in Tramo 2 AND are renamed `crypto_news_*` -> `feed_*` (P35), with a
  database migration — PENDING per the rename runbook
  (`.omo/runbooks/rename-onchain-bot-db.md`, phase 3). The new apps already
  declare `feed_*` shapes (`feed_publisher_*`, `feed_llm_config`,
  `feed_prompt_templates`, `feed_threads*`, `feed_scheduled_*`,
  `feed_scheduling_*`, `feed_ad_media_library`, `scheduled_posts`), but those
  shapes are UNWIRED — live feed data still sits in the backend
  `crypto_news_*` tables until cutover. Ads tables are also renamed to scheduling language (P36).
  Kept names (no rename): `channel_content_filter_configs`, `dedup_fingerprints`.
- Threads tables (`threads_*`) are owned by the standalone
  `threads-publisher` app (`onchain_bot_threads[_staging]`, 8 domain
  entities + `feed_threads`, in-memory live); `feed-publisher` keeps its
  own `feed_threads` + `feed_thread_messages` shapes for the v2 thread
  flow (unwired).
- Ingestion tables (`telegram_feed_*`) already carry the new naming and stay owned
  by ingestion-telegram; they are not moved or renamed.
- market-data (`onchain_bot_market_data[_staging]`, 0 tables) and
  dexter-onchain-bot (`onchain_bot_dexter[_staging]`, 0 tables, in-memory
  settings) declare no tables yet; ai-ml declares only
  `ai_ml_prompt_templates` (unwired); telegram-bots-gateway declares only
  `bot_vault` (scaffold-only).
- Ingestion tables (`telegram_feed_*`) already carry the new naming and stay owned
  by ingestion-telegram; they are not moved or renamed.
- One-off copies (`kols_backup_20260923`, `published_calls`, `notified_achievements`,
  backend `backfill_messages`) are history only and should be archived or dropped,
  not moved.

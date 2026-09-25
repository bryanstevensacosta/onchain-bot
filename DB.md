# Database inventory (plain language)

> Live re-query: 2026-09-25 via read-only `SELECT` on OracleDroplet + local dev.
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

### Database `onchain_bot_kol_system_staging` — future home of kol-system (0 tables)

Empty on purpose: the kol-system app (Tramo 1) will create its own tables here.
Nothing to list yet.

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
  (`onchain_bot_kol_system[_staging]`) in Tramo 1. The `kol-identity` profile idea
  was dropped (P4): channel lists stay in ingestion-telegram.
- Feed tables (`crypto_news_*` in the backend) move to the new `feed-publisher`
  database in Tramo 2 AND are renamed `crypto_news_*` -> `feed_*` (P35), with a
  database migration. Ads tables are also renamed to scheduling language (P36).
- Threads tables (`threads_*`) move to `feed-publisher` as well (threads area).
- Ingestion tables (`telegram_feed_*`) already carry the new naming and stay owned
  by ingestion-telegram; they are not moved or renamed.
- One-off copies (`kols_backup_20260923`, `published_calls`, `notified_achievements`,
  backend `backfill_messages`) are history only and should be archived or dropped,
  not moved.

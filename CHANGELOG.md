# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-08-23

### Features

- **telegram**: Add `INGESTION_TELEGRAM_MTPROTO_ENABLED` flag to disable MTProto per environment
- **chain-dexter-bot**: Simplify to plain CA message responses only (breaking change)

### Breaking Changes

- **chain-dexter-bot**: Removed all slash commands (`/start`, `/help`, `/x`, `/z`, `/c`, `/tb`, `/settings`). Bot now responds only to plain contract addresses.

### Bug Fixes

- **telegram-ingestion**: Prevent MTProto session conflicts between prod/staging/dev environments

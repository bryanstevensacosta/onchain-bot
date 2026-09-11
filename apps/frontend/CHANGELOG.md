# Changelog — frontend

Manual changelog (see root `RELEASE-FLOW.md`). Version history starts from v1.0.0.

## [Unreleased]

(none yet)

## [1.0.0] - 2026-09-11

**Baseline release**: Version reset for consistency across monorepo. This is the first official release with all apps aligned at v1.0.0.

### Features

- React 18 + Vite 5 dashboard with Feature-Sliced Design architecture
- Real-time WebSocket updates for pipeline events
- Token explorer with canonical calls and market snapshots
- KOL management with reputation scoring and lifecycle controls
- Crypto-news hub with messages, queue, keywords, blacklist, and LLM config
- Crypto-news ads manager with staged media protocol
- Content filters UI with live preview
- Settings management with presets
- Call tracking with milestone notifications
- Comprehensive test coverage (23 spec files, Vitest)

### Architecture

- TanStack Query v5 for server state management
- Socket.IO client for real-time updates
- Direct ingestion-service integration for crypto-news data
- Tailwind CSS 3.4 utility-first styling
- React Router v6 with 6 routes
- Nginx production deployment with per-prefix proxying

### UI/UX

- Dark mode slate-950 theme
- Responsive layout with mobile support
- Live feed with 50-item ring buffer
- Pagination (client-side)
- Clickable URLs with Telegram entity formatting
- Link previews with OG image display
- Media lightbox with keyboard navigation
- Toast notifications for actions

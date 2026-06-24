# Source BC (`kol/source/`)

Owns the **attribution** of token mentions to KOLs.

## Value objects

- `Source` (in `domain/value-objects/source.vo.ts`)
  - `kolId: string` — the KOL that mentioned the token
  - `sourceType: SourceType` — `'TELEGRAM' | 'DISCORD' | 'OTHER'`
  - `username: string | null`
  - `messageIds: ReadonlyArray<number>` — dedup'd list of messages
  - `mentionCount: number` — derived from `messageIds.length`
- `SourceType` — discriminator enum (`type` literal in TS)

## Port

- `SourceAggregatorPort` — consumers (e.g. `token/normalization/`) hand
  in raw mention seeds (`KolSourceSeed`) and get a deduplicated list of
  `Source` aggregates back. Avoids the consumer importing the `Source`
  VO directly.

## See also

- `kol-refactor.md` at the repo root — the plan that moved this VO out of `token/normalization/`.
- `kol/identity/` — owns the `Kol` aggregate referenced by `Source.kolId`.

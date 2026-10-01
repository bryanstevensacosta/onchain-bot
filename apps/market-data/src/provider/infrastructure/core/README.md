# Provider core (compat)

Single-file compat shim: `data-provider.port.ts` re-exports the
hexagonal home (`data-provider.port.ts:1-6`).

- Canonical: `src/provider/domain/data-provider.port.ts`
  (`DataProviderPort`: abstract `name: string`, abstract
  `logger: Logger`, `onModuleInit()` no-op by default,
  `domain/data-provider.port.ts:14-28`).
- Every adapter (including `rugcheck/`, `pumpdev/`) extends
  `DataProviderPort`; the `core/` path exists only so old deep imports
  keep resolving. Import from the domain barrel in new code.
- No base URL, auth, rate limits, or HTTP here — see each adapter's
  README.

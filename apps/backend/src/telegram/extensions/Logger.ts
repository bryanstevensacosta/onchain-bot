// Type-resolution shim for `telegram/extensions/Logger`.
//
// `tsconfig.json` maps `telegram/*` → `src/telegram/*`, so `tsc` resolves the
// service's `import ... from 'telegram/extensions/Logger'` to this file, which
// re-exports the real gramJS types from `node_modules/`. (Jest no longer routes
// through here: `moduleNameMapper` pins the path to the real file, mirroring
// ingestion-service. At runtime Node resolves the bare specifier to the real
// package.)
//
// We import from the relative `node_modules/` path to avoid recursion through
// the `telegram/*` alias (a bare `telegram/...` import here would redirect
// back to itself).
//
// This file is not imported by any source code via relative paths. Specs that
// need a fake Logger mock the `telegram/extensions/Logger` specifier directly
// (see `telegram-client-manager.service.spec.ts`).
export {
  Logger,
  LogLevel,
} from '../../../../../node_modules/telegram/extensions/Logger';

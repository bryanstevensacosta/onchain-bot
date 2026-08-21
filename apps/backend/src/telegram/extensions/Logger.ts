// Test-only re-export shim.
//
// Jest's moduleNameMapper (apps/backend/package.json) rewrites any
// `telegram/<sub>` import to `<rootDir>/src/telegram/<sub>`, so the
// service file's `import ... from 'telegram/extensions/Logger'` resolves
// here in test mode. The real gramJS package file lives at
// `node_modules/telegram/extensions/Logger.js` and is loaded by Node
// unchanged in production (Jest's moduleNameMapper is test-only).
//
// We import from the absolute path inside `node_modules/` to avoid
// recursion through Jest's mapper (a relative or bare `telegram/...`
// import inside this file would redirect back to itself).
//
// This file is intentionally not used by any source code under
// `apps/backend/src/`. Its sole purpose is to satisfy Jest's resolver.
// Specs that need a fake Logger override the resolution at this path
// (see `telegram-client-manager.service.spec.ts`).
export {
  Logger,
  LogLevel,
} from '../../../../../node_modules/telegram/extensions/Logger';

// lint-staged.config.js
// IMPORTANT: backend ESLint usa parserOptions.project = ['./tsconfig.eslint.json']
// que es relativo a apps/backend/eslint.config.mjs — eslint --config desde root
// resuelve correctamente porque flat config usa import.meta.dirname del config file.
// Prettier para TS/TSX se omite porque eslint-plugin-prettier ya lo aplica via --fix.
module.exports = {
  'apps/backend/src/**/*.ts': (files) =>
    `eslint --fix --config apps/backend/eslint.config.mjs ${files.join(' ')}`,
  'apps/backend/test/**/*.ts': (files) =>
    `eslint --fix --config apps/backend/eslint.config.mjs ${files.join(' ')}`,
  'apps/frontend/src/**/*.{ts,tsx}': (files) =>
    `eslint --fix --config apps/frontend/eslint.config.js ${files.join(' ')}`,
  '*.{json,md,yaml,yml}': ['prettier --write'],
};
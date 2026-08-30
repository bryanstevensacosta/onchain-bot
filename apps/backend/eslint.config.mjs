// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // In-memory repository overrides (NestJS pattern): the abstract
      // port declares async methods, the in-memory impl is synchronous
      // by design — Promise.resolve() is enough.
      '@typescript-eslint/require-await': 'off',
      // Test specs frequently import type unions that aren't directly
      // referenced in the spec body; allow underscore-prefixed or
      // type-only imports without flagging.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // The telegram-mtproto adapter uses `any` for the gramjs entity
      // shape (no first-party types); downgraded until we add explicit
      // types or replace the dependency.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      // Some MTProto flows await non-Promise values from gramjs
      // internals — surfaced as warnings for review.
      '@typescript-eslint/await-thenable': 'warn',
      // start-listening.consumeStream has a try/catch reserved for
      // future reconnect logic — silence until implemented.
      'no-useless-catch': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.spec.ts.bak', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      // Test files frequently work with mocks and test doubles that are
      // inherently untyped. Suppress unsafe-any warnings in test files
      // while maintaining them in production code.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);

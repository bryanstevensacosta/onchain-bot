// commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Additive only: base config lacks release/hotfix, which runbooks mandate
    // (release: dev -> master PRs, hotfix: production hotfixes).
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
        'release',
        'hotfix',
      ],
    ],
  },
};
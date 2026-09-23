# Bugfix Requirements Document

## Introduction

Staging deployment fails at the migration dry-run step with the error "Cannot find module '/app/src/shared/common/persistence/entities'". Despite explicitly setting `NODE_ENV=staging` via the `-e` flag in the `docker compose run` command, the migration scripts (`show-migrations.sh` and `run-migrations.sh`) fall back to TypeScript mode instead of using the compiled JavaScript files.

**Impact**: Staging deployments are blocked, preventing any code changes from reaching the staging environment for testing before production deployment.

**Affected Components**:

- `apps/backend/scripts/run-migrations.sh`
- `apps/backend/scripts/show-migrations.sh`
- `.github/workflows/deploy-staging.yml` (Dry-run migrations step)

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the deploy-staging workflow runs `docker compose run` with `-e NODE_ENV=staging`, THEN the migration scripts output "Showing migrations from TypeScript (src/)..." instead of "Showing migrations from compiled JavaScript (dist/)..."

1.2 WHEN the migration script executes `npx typeorm-ts-node-commonjs --dataSource src/shared/common/persistence/data-source.ts migration:show` inside the Docker container, THEN it fails with "Cannot find module '/app/src/shared/common/persistence/entities'" because the TypeScript source files are not fully copied into the Docker image

1.3 WHEN the shell condition `[ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ]` is evaluated in the bash script context, THEN it evaluates to false even though `NODE_ENV=staging` was passed via the docker `-e` flag

1.4 WHEN deployment logs are examined, THEN they show "Showing migrations from TypeScript (src/)..." proving the if-condition evaluated to false despite the environment variable being set

### Expected Behavior (Correct)

2.1 WHEN the deploy-staging workflow runs `docker compose run` with `-e NODE_ENV=staging`, THEN the migration scripts SHALL output "Showing migrations from compiled JavaScript (dist/)..." and execute the TypeORM CLI against the compiled JavaScript data source

2.2 WHEN the migration script executes in staging or production mode, THEN it SHALL run `npx typeorm -d ./dist/backend/src/shared/common/persistence/data-source.js migration:show` using the compiled JavaScript files that exist in the Docker image

2.3 WHEN the shell condition checks the NODE_ENV variable, THEN it SHALL correctly detect `NODE_ENV=staging` and branch to the compiled JavaScript code path

2.4 WHEN the migrations complete successfully, THEN deployment SHALL proceed to the "Run migrations" step without errors

### Unchanged Behavior (Regression Prevention)

3.1 WHEN running migrations in local development (NODE_ENV unset or empty), THEN the scripts SHALL CONTINUE TO use TypeScript mode: `npx typeorm-ts-node-commonjs --dataSource src/shared/common/persistence/data-source.ts migration:run`

3.2 WHEN running migrations in production with `NODE_ENV=production`, THEN the scripts SHALL CONTINUE TO use compiled JavaScript mode with the same data source path

3.3 WHEN the Dockerfile builds the backend image, THEN it SHALL CONTINUE TO copy `src/shared/common/persistence` for migration support (required by TypeORM even in compiled mode)

3.4 WHEN migrations run successfully (dev, staging, or production), THEN the database schema SHALL CONTINUE TO be updated correctly without data loss

3.5 WHEN the GitHub Actions workflow passes `-e NODE_ENV=staging` to docker commands, THEN other environment variables SHALL CONTINUE TO be recognized correctly (POSTGRES_HOST, POSTGRES_PORT, etc.)

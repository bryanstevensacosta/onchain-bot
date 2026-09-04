# Bugfix Requirements Document: Staging Backend Startup Hang

## Introduction

The staging backend service hangs indefinitely during TypeORM initialization, preventing successful deployments and causing health check failures. The root cause is TypeORM's `synchronize: true` configuration option, which performs heavy schema introspection operations that block the startup process in non-local environments. This bugfix transitions staging (and all future non-dev environments) from schema synchronization to migration-based schema management, as recommended by TypeORM's official documentation for production-like environments.

**Impact:** Every staging deployment requires manual intervention; containers remain unhealthy; CI/CD pipeline fails at health check step.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the backend starts in staging environment with `DATABASE_SYNCHRONIZE=true`, THE backend SHALL fail to complete startup within 120 seconds, with no log line containing "Application is running on" and port 3030 remaining unbound.

1.2 WHEN the backend has been running for at least 90 seconds without emitting "Application is running on", THE health check endpoint at `/api/health` SHALL return connection error "Connection reset by peer".

1.3 WHEN the deploy-staging workflow performs health checks against a backend that has not completed startup within 120 seconds, THE deployment SHALL fail with exit code 1 and message "Backend healthcheck failed after 60 attempts" where each attempt occurs every 2 seconds.

1.4 WHEN the backend container has been running for at least 120 seconds without binding to port 3030, THE container status SHALL show "Up X minutes (unhealthy)" and no ERROR-level or FATAL-level log entries SHALL be present in container logs.

1.5 WHEN TypeORM schema synchronization is active, THE backend SHALL emit log line containing "TypeORM synchronize: true" followed by either "Schema synchronization completed" within 90 seconds OR remain silent until process termination.

1.6 IF the backend emits "TypeORM synchronize: true" but does not emit "Schema synchronization completed" within 90 seconds, THEN THE system SHALL be considered hung during TypeORM initialization phase.

### Expected Behavior (Correct)

2.1 WHEN the backend starts in staging environment with migration-based schema management THEN the system SHALL complete TypeORM initialization within 30 seconds AND bind to port 3030 AND log "Nest application successfully started"

2.2 IF TypeORM initialization fails to complete within 30 seconds OR database connection cannot be established THEN the system SHALL exit with non-zero exit code AND log error message indicating the failure reason

2.3 WHEN TypeORM migrations are run during deployment THEN the migration command SHALL exit with code 0 AND log "Migration execution completed" before the backend container starts

2.4 IF TypeORM migrations fail during deployment THEN the migration command SHALL exit with non-zero code AND the backend container SHALL NOT start

2.5 WHEN the backend startup completes AND port 3030 is bound THEN the health check endpoint at `/api/health` SHALL respond with HTTP 200 within 2 seconds of receiving the first GET request

2.6 WHEN the deploy-staging workflow performs health checks THEN the workflow SHALL send GET requests to `/api/health` every 2 seconds for up to 5 attempts (10 seconds total) AND consider deployment successful IF any attempt receives HTTP 200 response

2.7 IF all 5 health check attempts fail to receive HTTP 200 response THEN the deploy-staging workflow SHALL mark the deployment as failed AND exit with non-zero code

2.8 IF the environment variable `NODE_ENV=staging` OR `NODE_ENV=production` THEN the system SHALL use migration-based schema management (`synchronize: false`)

2.9 IF the environment variable `NODE_ENV=development` OR `NODE_ENV=test` OR `NODE_ENV` is not set THEN the system SHALL use automatic schema synchronization (`synchronize: true`)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the backend starts AND NODE_ENV is set to 'development' OR NODE_ENV is not set, THEN the system SHALL set TypeORM synchronize option to true

3.2 WHEN the backend starts AND NODE_ENV is set to 'production', THEN the system SHALL set TypeORM synchronize option to false

3.3 WHEN TypeORM entities are registered in `DatabaseModule.PERSISTED_ENTITIES`, THEN the system SHALL load exactly 48 entity classes

3.4 WHEN the system logs entity registration during startup, THEN the system SHALL output the total count of loaded entities

3.5 WHEN the backend connects to PostgreSQL, THEN the system SHALL use connection parameters matching those defined in `app.config.ts` database section

3.6 WHEN a TypeORM repository executes findOne operation on an existing entity, THEN the system SHALL return the entity with all mapped properties populated

3.7 WHEN a TypeORM repository executes save operation on a valid entity, THEN the system SHALL persist the entity and return the saved entity with generated ID

3.8 WHEN a developer modifies an entity class property in local development (NODE_ENV='development' OR unset), THEN the system SHALL automatically apply the schema change to the database on next startup without requiring migration files

3.9 WHEN the system applies automatic schema synchronization, THEN the system SHALL log a message indicating schema synchronization occurred

## Bug Condition Analysis

**Bug Condition Function** - Identifies inputs that trigger the hang:

```pascal
FUNCTION isBugCondition(env)
  INPUT: env of type EnvironmentConfig
  OUTPUT: boolean

  // Returns true when staging/prod uses synchronize:true
  RETURN (env.NODE_ENV = "staging" OR env.NODE_ENV = "production")
         AND env.DATABASE_SYNCHRONIZE = true
END FUNCTION
```

**Property Specification** - Defines correct behavior for buggy inputs:

```pascal
// Property: Fix Checking - Staging Uses Migrations
FOR ALL env WHERE isBugCondition(env) DO
  startup_result ← bootstrap'(env)
  ASSERT startup_result.completed = true
         AND startup_result.time_elapsed < 30_seconds
         AND startup_result.health_check_status = "200 OK"
         AND env.DATABASE_SYNCHRONIZE = false
         AND migrations_applied = true
END FOR
```

**Preservation Goal** - Expressed in structured pseudocode:

```pascal
// Property: Preservation Checking - Dev/Test Unchanged
FOR ALL env WHERE NOT isBugCondition(env) DO
  ASSERT bootstrap(env) = bootstrap'(env)
         // Dev/test behavior unchanged: still uses synchronize:true
END FOR
```

**Key Definitions:**

- **F (bootstrap)**: The original function - backend startup with current configuration
- **F' (bootstrap')**: The fixed function - backend startup with environment-based synchronize toggle
- **isBugCondition**: True when environment is staging/production AND using synchronize:true
- **Counterexample**: Staging deployment on 2025-01-XX that hung at TypeORM init for 120+ seconds

## Migration Requirements

**Critical Path for Fix:**

1. **Generate Initial Migration** - Capture current schema state as baseline TypeORM migration
2. **Environment Detection** - Use `NODE_ENV` to determine `synchronize` value
3. **Workflow Integration** - Run migrations in deploy-staging workflow before container start
4. **Documentation** - Provide clear instructions for future schema changes

**Migration Execution Points:**

- **Staging:** Run migrations in deploy-staging workflow step (before `docker compose up`)
- **Production:** Run migrations in deploy.yml workflow step (already exists, verify)
- **Local Dev:** No migration execution required (synchronize:true handles it)
- **Tests:** Run migrations in `jest.setup.ts` OR use synchronize:true (TBD based on test DB setup)

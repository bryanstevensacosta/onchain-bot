-- PostgreSQL Extension Installation Script
--
-- Run this script once per environment (development, staging, production)
-- to pre-install all extensions that TypeORM might need.
--
-- **Context:**
-- TypeORM's PostgresDriver.afterConnect() automatically attempts to install
-- these extensions. In production-like environments, this can cause:
-- - Lock contention during connection pool initialization
-- - Permission errors (non-superuser roles)
-- - Indefinite hangs in staging/production
--
-- **Solution:**
-- Pre-install extensions manually, then set `installExtensions: false` in
-- TypeORM connection options to prevent automatic installation attempts.
--
-- **Usage:**
-- psql -h <host> -U <superuser> -d <database> -f scripts/db/install-extensions.sql
--
-- **Safety:**
-- All commands use `IF NOT EXISTS` - safe to run multiple times.
-- These extensions are standard PostgreSQL extensions and have no side effects
-- when installed but unused.

-- =============================================================================
-- UUID Extensions (for UUID primary keys and columns)
-- =============================================================================

-- uuid-ossp: Provides uuid_generate_v4() function
-- Default extension used by TypeORM for UUID columns
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto: Provides gen_random_uuid() function
-- Alternative UUID extension (more secure, modern)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Text Extensions
-- =============================================================================

-- citext: Case-insensitive text type
-- Used for @Column({ type: 'citext' }) in TypeORM entities
CREATE EXTENSION IF NOT EXISTS "citext";

-- =============================================================================
-- Data Structure Extensions
-- =============================================================================

-- hstore: Key-value store data type
-- Used for @Column({ type: 'hstore' }) in TypeORM entities
CREATE EXTENSION IF NOT EXISTS "hstore";

-- cube: Multi-dimensional cube data type
-- Used for @Column({ type: 'cube' }) in TypeORM entities
CREATE EXTENSION IF NOT EXISTS "cube";

-- ltree: Hierarchical tree-like structures
-- Used for @Column({ type: 'ltree' }) in TypeORM entities
CREATE EXTENSION IF NOT EXISTS "ltree";

-- =============================================================================
-- Vector/ML Extensions (optional)
-- =============================================================================

-- vector: Vector similarity search (pgvector)
-- Used for @Column({ type: 'vector' }) in TypeORM entities
-- NOTE: This extension may not be available in all PostgreSQL installations
-- If it fails, comment out this line - it's only needed for ML/vector workloads
CREATE EXTENSION IF NOT EXISTS "vector";

-- =============================================================================
-- PostGIS (Geospatial) Extensions (optional)
-- =============================================================================

-- postgis: Geospatial data types and functions
-- Used for @Column({ type: 'geometry' }) in TypeORM entities
-- NOTE: This extension may not be available in all PostgreSQL installations
-- If it fails, comment out this line - only needed for geospatial workloads
-- CREATE EXTENSION IF NOT EXISTS "postgis";

-- =============================================================================
-- Verification
-- =============================================================================

-- List all installed extensions (excluding built-in plpgsql)
SELECT
  extname AS "Extension Name",
  extversion AS "Version",
  CASE
    WHEN extname IN ('uuid-ossp', 'pgcrypto') THEN 'UUID generation'
    WHEN extname = 'citext' THEN 'Case-insensitive text'
    WHEN extname = 'hstore' THEN 'Key-value store'
    WHEN extname = 'cube' THEN 'Multi-dimensional cubes'
    WHEN extname = 'ltree' THEN 'Hierarchical trees'
    WHEN extname = 'vector' THEN 'Vector similarity search'
    WHEN extname = 'postgis' THEN 'Geospatial data'
    ELSE 'Other'
  END AS "Purpose"
FROM pg_extension
WHERE extname NOT IN ('plpgsql')
ORDER BY extname;

-- =============================================================================
-- Notes
-- =============================================================================

-- **For Development:**
-- Run this script once after creating local database:
--   psql -h localhost -U postgres -d alpha_meta_token_scanner -f scripts/db/install-extensions.sql

-- **For Staging/Production:**
-- Include this script in database initialization/migration process:
--   1. Run during initial database setup
--   2. Run as part of deployment scripts (idempotent - safe to re-run)

-- **Extension Usage in Our Project:**
-- As of 2025-01-13, our entities do NOT use:
-- - UUID columns (all PKs use BIGINT or VARCHAR)
-- - citext columns
-- - hstore, cube, ltree, vector, or geometry columns
--
-- These extensions are installed pre-emptively to prevent TypeORM from
-- attempting automatic installation, which causes hangs in staging/production.

-- **Rollback (if needed):**
-- To uninstall an extension:
--   DROP EXTENSION IF EXISTS "extension-name" CASCADE;
--
-- WARNING: CASCADE will drop all dependent objects (columns using the extension's types)

-- =============================================================================
-- End of Script
-- =============================================================================

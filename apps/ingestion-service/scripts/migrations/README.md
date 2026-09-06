# Ingestion Service Database Migrations

This directory contains SQL migrations for the ingestion-service database.

## Overview

The ingestion-service uses TypeORM with `synchronize: false` in production, so database schema changes must be applied manually via SQL migrations.

## Migration Files

| File                                     | Description                                                 | Status                  |
| ---------------------------------------- | ----------------------------------------------------------- | ----------------------- |
| `001-create-backfill-messages-table.sql` | Creates `backfill_messages` table for BackfillBufferService | ✅ Applied (2026-09-06) |

## Applying Migrations

### Option 1: Using the Shell Script (Recommended)

```bash
cd apps/ingestion-service
./scripts/apply-backfill-migration.sh
```

The script automatically detects if it's running inside a container or on the host and uses the appropriate method.

### Option 2: Manual Application (via Docker)

From the production server:

```bash
# Copy migration file to temp location
cat > /tmp/migration.sql << 'EOF'
[paste SQL content here]
EOF

# Apply migration
docker exec -i onchain-bot-postgres psql \
  -U alpha_meta_token_scanner \
  -d alpha_meta_token_scanner \
  < /tmp/migration.sql
```

### Option 3: Direct psql (Inside Container)

```bash
# Copy migration file into container
docker cp 001-create-backfill-messages-table.sql onchain-bot-postgres:/tmp/

# Execute inside container
docker exec onchain-bot-postgres psql \
  -U alpha_meta_token_scanner \
  -d alpha_meta_token_scanner \
  -f /tmp/001-create-backfill-messages-table.sql
```

## Verification

After applying a migration, verify the table structure:

```bash
docker exec onchain-bot-postgres psql \
  -U alpha_meta_token_scanner \
  -d alpha_meta_token_scanner \
  -c "\d backfill_messages"
```

Check ingestion-service logs for successful initialization:

```bash
docker logs onchain-bot-ingestion --tail 50 | grep BackfillBuffer
```

Expected output:

```
BackfillBufferService initializing with capacity 5000
Restoring backfill buffer from database...
Restored N messages from database (0 parse errors)
BackfillBufferService initialized with N messages from database
```

## Database Connection Details

- **Database**: `alpha_meta_token_scanner`
- **User**: `alpha_meta_token_scanner`
- **Container**: `onchain-bot-postgres`
- **Port**: 5432 (internal), mapped to host as needed

## Migration Naming Convention

Format: `NNN-description-kebab-case.sql`

- `NNN`: Three-digit sequence number (001, 002, ...)
- `description`: Brief description in kebab-case
- Extension: `.sql`

## Notes

- All migrations are idempotent (can be run multiple times safely using `IF NOT EXISTS` checks)
- Migrations should include comments explaining their purpose and related entities
- Always test migrations in staging/dev before applying to production
- Document applied migrations in this README with application date

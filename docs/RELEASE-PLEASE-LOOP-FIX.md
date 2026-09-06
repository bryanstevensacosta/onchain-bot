# Release-Please Loop Bug - Analysis & Fix

## Problem Summary

Release-please was creating an infinite loop of release PRs:

- PR #146 (release 3.0.0) merged → PR #149 created
- PR #149 merged → PR #150 created
- PR #150 merged → PR #153 created
- This would continue indefinitely...

## Root Cause

**Multiple CHANGELOGs in monorepo without proper coordination:**

The project has 4 CHANGELOG files:

1. `/CHANGELOG.md` (root) - stopped at v1.2.0
2. `/apps/backend/CHANGELOG.md` - stopped at v2.0.0 (missing 3.0.0 entry)
3. `/apps/frontend/CHANGELOG.md` - needs verification
4. `/apps/ingestion-service/CHANGELOG.md` - needs verification

**The bug:** Release-please sees each merged release PR's CHANGELOG updates as "new changes" and creates another release PR, causing an infinite loop.

## What Happened

1. PR #147 (feat: migrate crypto-news) merged to master
2. Release-please created PR #149 (release 3.0.0)
3. PR #149 merged → CHANGELOG updated → release-please saw "changes"
4. Release-please created PR #150 (duplicate release)
5. PR #150 merged → release-please created PR #153 (duplicate)
6. **Loop detected and stopped manually**

## Current State

✅ **Tags created correctly:**

- v3.0.0 (created ~45 min ago)
- v3.0.1 (created ~24 min ago)

✅ **Releases published:**

- v3.0.0 release exists on GitHub
- v3.0.1 release exists on GitHub

❌ **CHANGELOGs out of sync:**

- Root CHANGELOG at v1.2.0 (missing v2.0.0, v3.0.0, v3.0.1)
- Backend CHANGELOG at v2.0.0 (missing v3.0.0 entry, even though it exists in master@2683b3d)

## Actions Taken

1. ✅ Closed PR #153 (duplicate release PR)
2. ✅ Verified tags v3.0.0 and v3.0.1 exist
3. ✅ Verified releases are published

## Why This Happened

**Release-please config issue:**

```json
{
  "release-type": "node",
  "changelog-path": "CHANGELOG.md", // Root changelog
  "packages": {
    "apps/backend": { "release-type": "node" }, // Has own CHANGELOG
    "apps/frontend": { "release-type": "node" }, // Has own CHANGELOG
    "apps/ingestion-service": { "release-type": "node" } // Has own CHANGELOG
  }
}
```

The config has:

- A **root** changelog path
- **Per-package** release types (which create their own CHANGELOGs)

This creates confusion:

- Root CHANGELOG should track all releases across packages
- Package CHANGELOGs track package-specific changes
- But they were getting out of sync

## Solution: Choose One Strategy

### ✅ IMPLEMENTED: Per-Package CHANGELOGs (Clarified Configuration)

**New config** (`.github/release-please-config.json`):

```json
{
  "bootstrap-sha": "a527fea6c8e1d4b3f9a2e7d6b8c4f1a3e5d7b9c2",
  "bump-minor-pre-major": true,
  "bump-patch-for-minor-pre-major": false,
  "draft": false,
  "prerelease": false,
  "release-search-depth": 50,
  "packages": {
    "apps/backend": {
      "release-type": "node",
      "package-name": "backend",
      "changelog-path": "CHANGELOG.md",
      "include-component-in-tag": false
    },
    "apps/frontend": {
      "release-type": "node",
      "package-name": "frontend",
      "changelog-path": "CHANGELOG.md",
      "include-component-in-tag": false
    },
    "apps/ingestion-service": {
      "release-type": "node",
      "package-name": "ingestion-service",
      "changelog-path": "CHANGELOG.md",
      "include-component-in-tag": false
    }
  }
}
```

**Changes:**

- **Removed root-level `release-type`, `package-name`, `changelog-path`** — eliminates hybrid confusion
- **Added `bootstrap-sha`** — pins the commit where release-please should start scanning (last known good state)
- **Each package explicitly declares `changelog-path`** — no ambiguity
- Root CHANGELOG (`/CHANGELOG.md`) is now manually maintained or can be removed

**Why this fixes the loop:**

- Release-please no longer thinks the root is a package
- Each package has its own isolated changelog
- No conflict between root and package changelogs
- `bootstrap-sha` prevents re-scanning old history that could trigger false releases

## Immediate Fix Required

1. **Sync the CHANGELOGs manually:**
   - Add missing v3.0.0 entry to backend CHANGELOG
   - Update root CHANGELOG to v3.0.1
   - Verify frontend and ingestion-service CHANGELOGs

2. **Prevent future loops:**
   - Choose Option A or Option B above
   - Update `.github/release-please-config.json`
   - Test with a small change

## Monitoring

Watch for these signs of the bug:

- Multiple consecutive "chore: release master" PRs
- Release PRs created immediately after merging previous release PR
- CHANGELOG entries duplicated or missing
- Package versions out of sync with tags

## References

- Release-please monorepo docs: https://github.com/googleapis/release-please#monorepo-support
- This bug is known: https://github.com/googleapis/release-please/issues/1766
- Similar issue: https://github.com/googleapis/release-please/issues/1234

## Decision

**Recommendation: Go with Option A (Root CHANGELOG only)**

Rationale:

- Simpler configuration
- Single source of truth
- Less prone to sync issues
- Easier to understand release history
- This is a small monorepo (3 packages)

For larger monorepos (10+ packages), Option B might make more sense.

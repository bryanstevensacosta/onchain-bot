#!/usr/bin/env bash
#
# draft-changelog.sh — mechanical changelog DRAFT generator (Wave 6, todo 20).
#
# Usage: scripts/draft-changelog.sh <app> <since-tag> [/tmp/outfile]
#
#   <app>        one of: backend | frontend | ingestion-service
#                (mapped to path apps/<app>, mirroring the merge→app
#                mapping convention of .omo/evidence/task-3-manual-release-flow.tsv)
#   <since-tag>  any rev resolvable by `git rev-parse --verify` (tag, SHA, …).
#                Draft covers merge commits in <since-tag>..HEAD touching the app path.
#   [/tmp/outfile] optional: also tee stdout to a file — ONLY under /tmp/.
#
# What it does:
#   - `git log --merges --format=<sha subject>` over the app path (SUBJECT LINE
#     ONLY — never %B bodies, so re-emitted squash-body footers such as stray
#     `BREAKING CHANGE:` lines can NOT leak into bullets; that is the anti-dupe
#     guarantee — curation/judgment stays human per RELEASE-FLOW.md).
#   - Groups bullets Keep-a-Changelog style: ### Features (feat*), ### Fixes
#     (fix*), ### Others (everything else: chore, docs, sync vehicles, …).
#   - Each bullet ends with (<short-sha>) so every line traces to a real commit.
#
# What it NEVER does:
#   - NEVER writes to any CHANGELOG.md (stdout and /tmp/ only — the human
#     edits, judges versions, and signs, always).
#   - NEVER emits breaking-change judgments (draft lists facts; major/minor/
#     patch judgment is human per RELEASE-FLOW.md).
#
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: scripts/draft-changelog.sh <app> <since-tag> [/tmp/outfile]

  <app>         backend | frontend | ingestion-service
  <since-tag>   tag/SHA resolvable via `git rev-parse --verify` (draft = <since-tag>..HEAD)
  [/tmp/outfile] optional extra copy of the draft; MUST live under /tmp/

Examples:
  scripts/draft-changelog.sh backend backend-v4.0.0
  scripts/draft-changelog.sh backend f70d598 /tmp/draft-backend.txt
EOF
}

die_usage() {
  usage
  exit 2
}

# --- args -----------------------------------------------------------------
[ "$#" -ge 2 ] && [ "$#" -le 3 ] || die_usage

APP="$1"
SINCE="$2"
OUTFILE="${3:-}"

case "${APP}" in
  backend|frontend|ingestion-service) ;;
  *) echo "error: unknown app '${APP}' (want: backend|frontend|ingestion-service)" >&2; die_usage ;;
esac

APPPATH="apps/${APP}"

# <since-tag> must resolve to a commit (tag, SHA, other rev).
if ! SINCE_COMMIT="$(git rev-parse --verify --quiet "${SINCE}^{commit}")"; then
  echo "error: since-ref '${SINCE}' does not resolve (git rev-parse --verify failed)" >&2
  die_usage
fi

# Optional outfile: /tmp/ only — never a changelog, never inside the repo.
if [ -n "${OUTFILE}" ]; then
  case "${OUTFILE}" in
    /tmp/*) ;;
    *) echo "error: outfile must be under /tmp/ (got '${OUTFILE}')" >&2; die_usage ;;
  esac
  case "${OUTFILE}" in
    *CHANGELOG*|*changelog*) echo "error: outfile must not look like a changelog" >&2; die_usage ;;
  esac
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

TODAY="$(date +%Y-%m-%d)"
RANGE="${SINCE}..HEAD"

# --- collect merge subjects (subject line ONLY: %s, never %B) ---------------
# Format per line: <full-sha> <short-sha> <subject>
MAPFILE="$(mktemp /tmp/draft-changelog.XXXXXX)"
trap 'rm -f "${MAPFILE}"' EXIT
git log --merges --format='%H %h %s' "${RANGE}" -- "${APPPATH}" > "${MAPFILE}" || true
TOTAL="$(wc -l < "${MAPFILE}" | tr -d ' ')"

# --- classify ---------------------------------------------------------------
# Conventional-type prefix on the SUBJECT: feat[!/(:] → Features,
# fix[!/(:] → Fixes, everything else → Others. Case-insensitive type word.
classify() {
  local subject="$1"
  local head="${subject%%[(:! ]*}"
  local lower
  lower="$(printf '%s' "${head}" | tr '[:upper:]' '[:lower:]')"
  case "${lower}" in
    feat) printf 'feat' ;;
    fix)  printf 'fix' ;;
    *)    printf 'other' ;;
  esac
}

FEATS="$(mktemp /tmp/draft-changelog.feats.XXXXXX)"
FIXES="$(mktemp /tmp/draft-changelog.fixes.XXXXXX)"
OTHERS="$(mktemp /tmp/draft-changelog.others.XXXXXX)"
trap 'rm -f "${MAPFILE}" "${FEATS}" "${FIXES}" "${OTHERS}"' EXIT

while IFS= read -r line; do
  [ -n "${line}" ] || continue
  full="${line%% *}"; rest="${line#* }"
  short="${rest%% *}"; subject="${rest#* }"
  bullet="- ${subject} (${short})"
  case "$(classify "${subject}")" in
    feat) printf '%s\n' "${bullet}" >> "${FEATS}" ;;
    fix)  printf '%s\n' "${bullet}" >> "${FIXES}" ;;
    *)    printf '%s\n' "${bullet}" >> "${OTHERS}" ;;
  esac
done < "${MAPFILE}"

print_group() {
  local file="$1"
  if [ -s "${file}" ]; then
    cat "${file}"
  else
    printf '(none)\n'
  fi
}

# --- render (stdout; optional tee to /tmp/) ---------------------------------
render() {
  printf '# Draft changelog — %s\n' "${APP}"
  printf '# Range: %s (path: %s)\n' "${RANGE}" "${APPPATH}"
  printf '# Date: %s | merge commits touching path: %s\n' "${TODAY}" "${TOTAL}"
  printf '# DRAFT ONLY — human curates, judges versions, edits + signs the real\n'
  printf '# CHANGELOG.md. This script never writes changelogs.\n'
  printf '\n'
  if [ "${TOTAL}" = "0" ]; then
    printf 'No merge commits touching %s in %s.\n' "${APPPATH}" "${RANGE}"
    return 0
  fi
  printf '### Features\n'
  printf '\n'
  print_group "${FEATS}"
  printf '\n'
  printf '### Fixes\n'
  printf '\n'
  print_group "${FIXES}"
  printf '\n'
  printf '### Others\n'
  printf '\n'
  print_group "${OTHERS}"
}

if [ -n "${OUTFILE}" ]; then
  render | tee "${OUTFILE}"
else
  render
fi

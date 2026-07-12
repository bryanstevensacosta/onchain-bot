#!/usr/bin/env bash
set -euo pipefail

show_usage() {
  echo "Usage: $0 [--yes]"
  echo ""
  echo "Helper script to run Terraform for branch protection."
  echo ""
  echo "Arguments:"
  echo "  --yes    Skip confirmation prompt (for CI)"
  echo ""
  echo "Environment variables:"
  echo "  GITHUB_TOKEN    - GitHub personal access token (required)"
  echo "  GITHUB_OWNER    - GitHub organization or owner (optional, auto-detected)"
  echo "  GITHUB_REPO     - GitHub repository name (optional, auto-detected)"
  echo ""
  echo "Example:"
  echo "  GITHUB_TOKEN=ghp_xxx bash scripts/setup-iac.sh"
  exit 1
}

# Check for --help or -h
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  show_usage
fi

# Check for required tokens
if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "Error: GITHUB_TOKEN must be set"
  echo ""
  show_usage
fi

# Auto-detect owner/repo from git remote
REPO_INFO=$(git remote get-url origin 2>/dev/null || echo "")
if [[ -n "$REPO_INFO" ]]; then
  # Extract owner/repo from URL like git@github.com:owner/repo.git or https://github.com/owner/repo.git
  REPO_PATH=$(echo "$REPO_INFO" | sed 's/.*github.com[/:]//' | sed 's/\.git$//')
  OWNER=$(echo "$REPO_PATH" | cut -d'/' -f1)
  REPO_NAME=$(echo "$REPO_PATH" | cut -d'/' -f2)
fi

GITHUB_OWNER="${GITHUB_OWNER:-$OWNER}"
GITHUB_REPO="${GITHUB_REPO:-$REPO_NAME}"

echo "=== Branch Protection Setup ==="
echo "Owner: $GITHUB_OWNER"
echo "Repo: $GITHUB_REPO"
echo ""

# Check if branch protection already exists
echo "=== Checking existing GitHub resources ==="
EXISTING_PROTECTION=$(gh api repos/"$GITHUB_OWNER"/"$GITHUB_REPO"/branches/master/protection 2>/dev/null || echo "")

if [[ -n "$EXISTING_PROTECTION" ]]; then
  echo "⚠️  Branch protection on master already exists (created manually or by previous apply)"
  echo "   Run 'terraform import' before apply, or use '--yes' to auto-import"
  IMPORT_CMD="terraform import github_branch_protection.master $GITHUB_OWNER:$GITHUB_REPO:master"
  echo "   Import command: $IMPORT_CMD"
  echo ""
fi

cd "$(dirname "$0")/../infra/terraform"

# Initialize Terraform
echo "=== Initializing Terraform ==="
terraform init

# Create terraform.tfvars if not exists
if [[ ! -f "terraform.tfvars" ]]; then
  echo "github_token = \"$GITHUB_TOKEN\"" > terraform.tfvars
  [[ -n "$GITHUB_OWNER" ]] && echo "github_owner = \"$GITHUB_OWNER\"" >> terraform.tfvars
  [[ -n "$GITHUB_REPO" ]] && echo "github_repo = \"$GITHUB_REPO\"" >> terraform.tfvars
fi

# Plan
echo ""
echo "=== Terraform Plan ==="
terraform plan

# Apply
if [[ "${1:-}" == "--yes" ]]; then
  echo ""
  echo "=== Applying (--yes flag) ==="
  terraform apply -auto-approve
else
  echo ""
  read -p "Apply? (y/N) " confirm
  if [[ "$confirm" == "y" ]] || [[ "$confirm" == "Y" ]]; then
    terraform apply
  else
    echo "Aborted."
  fi
fi
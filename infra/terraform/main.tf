terraform {
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

provider "github" {
  token = var.github_token
  owner = var.github_owner
}

# Branch protection for master (strict)
resource "github_branch_protection" "master" {
  repository_id          = "onchain-bot"
  pattern                = "master"
  requires_status_checks = true
  strict                 = true

  required_status_checks {
    contexts = ["Tests", "Lint", "TypeScript Check"]
  }

  # No PR reviews required - solo dev
  restrict_pushes {
    push_allowances = []
  }

  required_linear_history  = true
}

# Branch protection for dev (permissive)
resource "github_branch_protection" "dev" {
  repository_id          = "onchain-bot"
  pattern                = "dev"
  requires_status_checks = false

  restrict_pushes {
    push_allowances = []
  }
}
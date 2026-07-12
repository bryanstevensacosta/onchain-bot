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
  repository_id = "onchain-bot"
  pattern       = "master"

  required_status_checks {
    strict   = true
    contexts = ["Tests", "Lint", "TypeScript Check"]
  }

  # No PR reviews required - solo dev
  restrict_pushes {
    push_allowances = []
  }

  required_linear_history = true
}

# Branch protection for dev (permissive)
resource "github_branch_protection" "dev" {
  repository_id = "onchain-bot"
  pattern       = "dev"

  restrict_pushes {
    push_allowances = []
  }
}
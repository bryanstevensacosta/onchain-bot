variable "github_token" {
  description = "GitHub personal access token"
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "GitHub organization or owner"
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = ""
}

output "repository_id" {
  description = "The ID of the repository"
  value       = github_repository.main.id
}

output "repository_name" {
  description = "The name of the repository"
  value       = github_repository.main.name
}
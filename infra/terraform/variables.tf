variable "github_token" {
  description = "GitHub personal access token"
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "GitHub organization or owner"
  type        = string
  default     = "bryanstevensacosta"
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "onchain-bot"
}
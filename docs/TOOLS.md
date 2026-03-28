# Bitbucket MCP Server - Tool Reference

This document provides a detailed reference for all tools available in the Bitbucket MCP Server. These tools allow AI models to interact with Bitbucket workspaces, repositories, pull requests, issues, and more.

## Repository Management

### list-repositories
Lists repositories in a Bitbucket workspace.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `role` (optional): Filter by user role (owner, admin, contributor, member)
- `sort` (optional): Sort by (created_on, updated_on, name, size)
- `page` (optional): Page number or opaque next page URL returned by Bitbucket pagination
- `pagelen` (optional): Number of items per page (default: 10, min: 10, max: 100)

### get-repository
Gets detailed information about a specific repository.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug

## Pull Requests

### list-pull-requests
Lists pull requests for a repository.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `state` (optional): Filter by state (OPEN, MERGED, DECLINED, SUPERSEDED)

### get-pull-request
Gets detailed information about a specific pull request.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `pull_request_id` (required): Pull request ID

### create-pull-request
Creates a new pull request in a repository.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `title` (required): Title of the pull request
- `source_branch` (required): Source branch name (the branch with your changes)
- `destination_branch` (optional): Destination branch name (defaults to the repository's main branch)
- `description` (optional): Description of the pull request (supports Markdown)
- `close_source_branch` (optional): Whether to close the source branch after the PR is merged
- `reviewers` (optional): List of reviewer account UUIDs (e.g. `{account-uuid}`)

**Authentication Required:** This tool requires `BITBUCKET_API_TOKEN` environment variable to be set, and the token must have "Pull requests: Write" permission.

### update-pr-description
Updates the title and/or description of an existing pull request.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `pull_request_id` (required): Pull request ID
- `title` (optional): New title for the pull request
- `description` (optional): New description for the pull request

**Authentication Required:** This tool requires `BITBUCKET_API_TOKEN` environment variable to be set, and the token must have "Pull requests: Write" permission.

### create-pr-comment
Creates a comment on a pull request. This tool can create both regular comments and inline comments on specific files and line numbers.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `pull_request_id` (required): Pull request ID
- `content` (required): Comment content in plain text
- `file_path` (optional): Path to the file for inline comments
- `from_line` (optional): Line number in the old version of the file (for inline comments)
- `to_line` (optional): Line number in the new version of the file (for inline comments)

**Authentication Required:** This tool requires `BITBUCKET_API_TOKEN` environment variable to be set, and the token must have "Pull requests: Write" permission.

### list-pr-comments
Lists all comments on a pull request, including inline comments and replies.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `pull_request_id` (required): Pull request ID

### get-pr-comment
Gets detailed information about a specific comment on a pull request.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `pull_request_id` (required): Pull request ID
- `comment_id` (required): Comment ID

### get-pr-diff
Gets the diff/changes of a specific pull request.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `pull_request_id` (required): Pull request ID

## Issues

### list-issues
Lists issues for a repository.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `state` (optional): Filter by state (new, open, resolved, on hold, invalid, duplicate, wontfix, closed)
- `kind` (optional): Filter by kind (bug, enhancement, proposal, task)

## Source Code

### list-branches
Lists branches for a repository.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug

### get-commits
Gets recent commits for a repository.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `branch` (optional): Specific branch name
- `page` (optional): Page number or opaque next page URL from Bitbucket pagination
- `pagelen` (optional): Number of commits per page (default: 10, min: 10, max: 100)

### get-commit
Gets detailed information about a specific commit in a repository.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `commit_hash` (required): Commit hash (full 40-char or short 7+ char)

## Pipelines

### list-pipelines
Lists pipelines for a repository.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `page` (optional): Page number or opaque next page URL returned by Bitbucket pagination
- `pagelen` (optional): Number of items per page (default: 10, min: 10, max: 100)

### trigger-pipeline
Triggers a new pipeline for a repository.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `repo_slug` (required): Repository name/slug
- `ref_name` (optional): Name of the branch or tag
- `ref_type` (optional): Type of reference (`branch` or `tag`)
- `commit_hash` (optional): Full hash of the commit to run the pipeline on
- `selector_type` (optional): Type of selector (e.g., 'custom', 'default')
- `selector_pattern` (optional): Pattern for the selector (e.g., custom pipeline name)
- `variables` (optional): Environment variables for the pipeline (key-value pairs)

**Required parameter combinations:**
- You must provide either:
  - both `ref_type` and `ref_name` (to target a branch or tag), or
  - `commit_hash` (to target a specific commit).
- If you provide `selector_type` or `selector_pattern`, you must provide both; they must be supplied together to select a specific pipeline.
**Authentication Required:** This tool requires `BITBUCKET_API_TOKEN` environment variable to be set, and the token must have "Pipelines: Write" permission.

## System & Search

### search
Searches across repositories, pull requests, issues, and commits in a workspace.

**Parameters:**
- `workspace` (optional): Bitbucket workspace name. Defaults to `BITBUCKET_WORKSPACE` env var if not provided.
- `query` (required): Search query (searches in titles, descriptions, and content)
- `types` (optional): Types of items to search (repositories, pull-requests, issues, commits) (default: `["repositories", "pull-requests", "issues"]`)
- `limit` (optional): Maximum number of results per type (default: 10)

### health-check
Checks connectivity to Bitbucket API and validates credentials.

**Parameters:**
- `workspace` (optional): Optional workspace to test access (defaults to 'atlassian')

### get-metrics
Gets server performance metrics and statistics.

**Parameters:**
- None

import type {
  Repository,
  PullRequest,
  Issue,
  Branch,
  Commit,
} from "../bitbucket-api.js";

export interface PaginatedResult<T> {
  items: T[];
  page?: number;
  pagelen?: number;
  next?: string;
  hasMore: boolean;
}

export interface ListRepositoriesInput {
  workspace: string;
  role?: "owner" | "admin" | "contributor" | "member";
  sort?: "created_on" | "updated_on" | "name" | "size";
  page?: string;
  pagelen?: number;
}
export type ListRepositoriesResult = PaginatedResult<Repository>;

export interface GetRepositoryInput {
  workspace: string;
  repo_slug: string;
}
export type GetRepositoryResult = Repository;

export interface ListPullRequestsInput {
  workspace: string;
  repo_slug: string;
  state?:
    | "OPEN"
    | "MERGED"
    | "DECLINED"
    | "SUPERSEDED"
    | Array<"OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED">;
  page?: string;
  pagelen?: number;
}
export type ListPullRequestsResult = PaginatedResult<PullRequest>;

export interface GetPullRequestInput {
  workspace: string;
  repo_slug: string;
  pr_id: number;
}
export type GetPullRequestResult = PullRequest;

// Add additional input/output types as later tasks introduce new core modules.
// Keep this file the single source of truth for the cross-adapter contract.

export interface CreatePullRequestInput {
  workspace: string;
  repo_slug: string;
  title: string;
  source_branch: string;
  destination_branch?: string;
  description?: string;
  close_source_branch?: boolean;
  reviewers?: string[];
}
export type CreatePullRequestResult = PullRequest;

export interface UpdatePullRequestInput {
  workspace: string;
  repo_slug: string;
  pull_request_id: number;
  title?: string;
  description?: string;
}
export type UpdatePullRequestResult = PullRequest;

export interface GetPullRequestDiffInput {
  workspace: string;
  repo_slug: string;
  pull_request_id: number;
}
export type GetPullRequestDiffResult = { diff: string };

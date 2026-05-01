import type {
  Repository,
  PullRequest,
  Issue,
  Branch,
  Commit,
  Comment,
  Pipeline,
  PipelineStep,
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

export type SearchType = "repositories" | "pull-requests" | "issues" | "commits";

export interface SearchInput {
  workspace: string;
  query: string;
  types: SearchType[];
  limit: number;
}

export interface SearchHit<T> {
  type: SearchType;
  repo: string;       // repo slug
  item: T;
}

export interface SearchSectionMeta {
  type: SearchType;
  searched: number;       // how many repos were inspected
  totalRepos: number;     // total in the page that was retrieved
  hasMoreRepos: boolean;  // whether the listRepositories call had a next page
  errors: Array<{ repo: string; message: string }>;
}

export interface SearchResult {
  workspace: string;
  query: string;
  totalRepos: number;
  hasMoreRepos: boolean;
  hits: {
    repositories: SearchHit<Repository>[];
    pullRequests: SearchHit<PullRequest>[];
    issues: SearchHit<Issue>[];
    commits: SearchHit<Commit>[];
  };
  sections: SearchSectionMeta[];
  totalHits: number;
}

export interface ListIssuesInput {
  workspace: string;
  repo_slug: string;
  state?: "new" | "open" | "resolved" | "on hold" | "invalid" | "duplicate" | "wontfix" | "closed";
  kind?: "bug" | "enhancement" | "proposal" | "task";
  page?: string;
  pagelen?: number;
}
export type ListIssuesResult = PaginatedResult<Issue>;

export interface ListBranchesInput {
  workspace: string;
  repo_slug: string;
  page?: string;
  pagelen?: number;
}
export type ListBranchesResult = PaginatedResult<Branch>;

export interface ListCommitsInput {
  workspace: string;
  repo_slug: string;
  branch?: string;
  page?: string;
  pagelen?: number;
}
export type ListCommitsResult = PaginatedResult<Commit>;

export interface GetCommitInput {
  workspace: string;
  repo_slug: string;
  commit_hash: string;
}
export type GetCommitResult = Commit;

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

export interface ListPrCommentsInput {
  workspace: string;
  repo_slug: string;
  pull_request_id: number;
  page?: string;
  pagelen?: number;
}
export type ListPrCommentsResult = PaginatedResult<Comment>;

export interface GetPrCommentInput {
  workspace: string;
  repo_slug: string;
  pull_request_id: number;
  comment_id: number;
}
export type GetPrCommentResult = Comment;

export interface CreatePrCommentInput {
  workspace: string;
  repo_slug: string;
  pull_request_id: number;
  content: string;
  parent_id?: number;
  inline?: { path: string; from?: number; to?: number };
}
export type CreatePrCommentResult = Comment;

export interface ListPipelinesInput {
  workspace: string;
  repo_slug: string;
  page?: string;
  pagelen?: number;
}
export type ListPipelinesResult = PaginatedResult<Pipeline>;

export interface GetPipelineInput {
  workspace: string;
  repo_slug: string;
  pipeline_uuid: string;
}
export type GetPipelineResult = Pipeline;

export interface TriggerPipelineInput {
  workspace: string;
  repo_slug: string;
  ref_type?: "branch" | "tag";
  ref_name?: string;
  commit_hash?: string;
  selector_type?: string;
  selector_pattern?: string;
  variables?: Array<{ key: string; value: string }>;
}
export type TriggerPipelineResult = Pipeline;

export interface ListPipelineStepsInput {
  workspace: string;
  repo_slug: string;
  pipeline_uuid: string;
  page?: string;
  pagelen?: number;
}
export type ListPipelineStepsResult = PaginatedResult<PipelineStep>;

export interface GetPipelineStepInput {
  workspace: string;
  repo_slug: string;
  pipeline_uuid: string;
  step_uuid: string;
}
export type GetPipelineStepResult = PipelineStep;

export interface GetPipelineStepLogInput {
  workspace: string;
  repo_slug: string;
  pipeline_uuid: string;
  step_uuid: string;
}
export type GetPipelineStepLogResult = { log: string };

export interface AuthStatusInput {
  workspace?: string;
}

export interface AuthStatusResult {
  authenticated: boolean;
  authMethod: "token" | "basic" | "none";
  workspaceTested: string;
  reachable: boolean;
  error?: string;
}

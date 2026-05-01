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

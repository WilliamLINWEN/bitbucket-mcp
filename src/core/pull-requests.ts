import type { BitbucketAPI } from "../bitbucket-api.js";
import type {
  ListPullRequestsInput, ListPullRequestsResult,
  GetPullRequestInput, GetPullRequestResult,
  CreatePullRequestInput, CreatePullRequestResult,
  UpdatePullRequestInput, UpdatePullRequestResult,
  GetPullRequestDiffInput, GetPullRequestDiffResult,
} from "./types.js";

export async function listPullRequests(
  api: BitbucketAPI, input: ListPullRequestsInput,
): Promise<ListPullRequestsResult> {
  const result = await api.getPullRequests(
    input.workspace, input.repo_slug, input.state, input.page, input.pagelen,
  );
  return {
    items: result.pullRequests,
    page: result.page,
    pagelen: result.pagelen,
    next: result.next,
    hasMore: result.hasMore,
  };
}

export async function getPullRequest(
  api: BitbucketAPI, input: GetPullRequestInput,
): Promise<GetPullRequestResult> {
  return api.getPullRequest(input.workspace, input.repo_slug, input.pr_id);
}

export async function createPullRequest(
  api: BitbucketAPI, input: CreatePullRequestInput,
): Promise<CreatePullRequestResult> {
  return api.createPullRequest(input.workspace, input.repo_slug, {
    title: input.title,
    source_branch: input.source_branch,
    destination_branch: input.destination_branch,
    description: input.description,
    close_source_branch: input.close_source_branch,
    reviewers: input.reviewers,
  });
}

export async function updatePullRequest(
  api: BitbucketAPI, input: UpdatePullRequestInput,
): Promise<UpdatePullRequestResult> {
  const patch: { title?: string; description?: string } = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (Object.keys(patch).length === 0) {
    throw new Error("updatePullRequest requires at least one of `title` or `description`");
  }
  return api.updatePullRequest(input.workspace, input.repo_slug, input.pull_request_id, patch);
}

export async function getPullRequestDiff(
  api: BitbucketAPI, input: GetPullRequestDiffInput,
): Promise<GetPullRequestDiffResult> {
  const diff = await api.getPullRequestDiff(input.workspace, input.repo_slug, input.pull_request_id);
  return { diff };
}

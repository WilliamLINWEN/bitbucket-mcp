import type { BitbucketAPI } from "../bitbucket-api.js";
import type {
  ListPrCommentsInput, ListPrCommentsResult,
  GetPrCommentInput, GetPrCommentResult,
  CreatePrCommentInput, CreatePrCommentResult,
  UpdatePrCommentInput, UpdatePrCommentResult,
  DeletePrCommentInput,
} from "./types.js";

export async function listPrComments(
  api: BitbucketAPI, input: ListPrCommentsInput,
): Promise<ListPrCommentsResult> {
  const result = await api.getPullRequestComments(
    input.workspace, input.repo_slug, input.pull_request_id,
    { page: input.page, pagelen: input.pagelen },
  );
  return {
    items: result.comments,
    page: result.page,
    pagelen: result.pagelen,
    next: result.next,
    hasMore: result.hasMore,
  };
}

export async function getPrComment(
  api: BitbucketAPI, input: GetPrCommentInput,
): Promise<GetPrCommentResult> {
  return api.getPullRequestComment(
    input.workspace, input.repo_slug, input.pull_request_id, input.comment_id,
  );
}

export async function createPrComment(
  api: BitbucketAPI, input: CreatePrCommentInput,
): Promise<CreatePrCommentResult> {
  return api.createPullRequestComment(
    input.workspace, input.repo_slug, input.pull_request_id,
    input.content,
    input.inline,
    input.parent_id,
  );
}

export async function updatePrComment(
  api: BitbucketAPI, input: UpdatePrCommentInput,
): Promise<UpdatePrCommentResult> {
  return api.updatePullRequestComment(
    input.workspace, input.repo_slug, input.pull_request_id,
    input.comment_id, input.content,
  );
}

export async function deletePrComment(
  api: BitbucketAPI, input: DeletePrCommentInput,
): Promise<void> {
  await api.deletePullRequestComment(
    input.workspace, input.repo_slug, input.pull_request_id, input.comment_id,
  );
}

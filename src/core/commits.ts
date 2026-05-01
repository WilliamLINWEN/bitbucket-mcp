import type { BitbucketAPI } from "../bitbucket-api.js";
import type {
  ListCommitsInput,
  ListCommitsResult,
  GetCommitInput,
  GetCommitResult,
} from "./types.js";

export async function listCommits(
  api: BitbucketAPI,
  input: ListCommitsInput,
): Promise<ListCommitsResult> {
  const result = await api.getCommits(
    input.workspace,
    input.repo_slug,
    input.branch,
    input.page,
    input.pagelen,
  );
  return {
    items: result.commits,
    page: result.page,
    pagelen: result.pagelen,
    next: result.next,
    hasMore: result.hasMore,
  };
}

export async function getCommit(
  api: BitbucketAPI,
  input: GetCommitInput,
): Promise<GetCommitResult> {
  return api.getCommit(input.workspace, input.repo_slug, input.commit_hash);
}

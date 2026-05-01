import type { BitbucketAPI } from "../bitbucket-api.js";
import type { ListBranchesInput, ListBranchesResult } from "./types.js";

export async function listBranches(
  api: BitbucketAPI,
  input: ListBranchesInput,
): Promise<ListBranchesResult> {
  const result = await api.getBranches(
    input.workspace,
    input.repo_slug,
    input.page,
    input.pagelen,
  );
  return {
    items: result.branches,
    page: result.page,
    pagelen: result.pagelen,
    next: result.next,
    hasMore: result.hasMore,
  };
}

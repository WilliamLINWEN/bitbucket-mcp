import type { BitbucketAPI } from "../bitbucket-api.js";
import type { ListIssuesInput, ListIssuesResult } from "./types.js";

export async function listIssues(
  api: BitbucketAPI,
  input: ListIssuesInput,
): Promise<ListIssuesResult> {
  const result = await api.getIssues(
    input.workspace,
    input.repo_slug,
    input.state,
    input.page,
    input.pagelen,
  );
  return {
    items: result.issues,
    page: result.page,
    pagelen: result.pagelen,
    next: result.next,
    hasMore: result.hasMore,
  };
}

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
  // Client-side kind filter (Bitbucket API doesn't support filtering by kind)
  const items = input.kind
    ? result.issues.filter((i) => i.kind === input.kind)
    : result.issues;
  return {
    items,
    page: result.page,
    pagelen: result.pagelen,
    next: result.next,
    hasMore: result.hasMore,
  };
}

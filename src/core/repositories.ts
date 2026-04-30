import type { BitbucketAPI } from "../bitbucket-api.js";
import type {
  ListRepositoriesInput,
  ListRepositoriesResult,
  GetRepositoryInput,
  GetRepositoryResult,
} from "./types.js";

export async function listRepositories(
  api: BitbucketAPI,
  input: ListRepositoriesInput,
): Promise<ListRepositoriesResult> {
  const result = await api.listRepositories(input.workspace, {
    role: input.role,
    sort: input.sort,
    page: input.page,
    pagelen: input.pagelen,
  });
  return {
    items: result.repositories,
    page: result.page,
    pagelen: result.pagelen,
    next: result.next,
    hasMore: result.hasMore,
  };
}

export async function getRepository(
  api: BitbucketAPI,
  input: GetRepositoryInput,
): Promise<GetRepositoryResult> {
  return api.getRepository(input.workspace, input.repo_slug);
}

import type { BitbucketAPI } from "../bitbucket-api.js";
import * as repositoriesCore from "./repositories.js";
import type { AuthStatusInput, AuthStatusResult } from "./types.js";

export async function authStatus(
  api: BitbucketAPI,
  input: AuthStatusInput,
): Promise<AuthStatusResult> {
  const workspaceTested = input.workspace ?? process.env.BITBUCKET_WORKSPACE ?? "atlassian";
  const authMethod = await api.getAuthMethod();
  try {
    const result = await repositoriesCore.listRepositories(api, { workspace: workspaceTested });
    return {
      authenticated: authMethod !== "none",
      authMethod,
      workspaceTested,
      reachable: true,
      repositoriesFound: result.items.length,
      hasMoreRepos: result.hasMore,
    };
  } catch (error) {
    return {
      authenticated: false,
      authMethod,
      workspaceTested,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

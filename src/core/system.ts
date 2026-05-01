import type { BitbucketAPI } from "../bitbucket-api.js";
import * as repositoriesCore from "./repositories.js";
import type { AuthStatusInput, AuthStatusResult } from "./types.js";

function detectAuthMethod(): "token" | "basic" | "none" {
  if (process.env.BITBUCKET_API_TOKEN) return "token";
  if (process.env.BITBUCKET_USERNAME && process.env.BITBUCKET_APP_PASSWORD) return "basic";
  return "none";
}

export async function authStatus(
  api: BitbucketAPI,
  input: AuthStatusInput,
): Promise<AuthStatusResult> {
  const workspaceTested = input.workspace ?? process.env.BITBUCKET_WORKSPACE ?? "atlassian";
  const authMethod = detectAuthMethod();
  try {
    await repositoriesCore.listRepositories(api, { workspace: workspaceTested });
    return {
      authenticated: authMethod !== "none",
      authMethod,
      workspaceTested,
      reachable: true,
    };
  } catch (error) {
    return {
      authenticated: authMethod !== "none",
      authMethod,
      workspaceTested,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

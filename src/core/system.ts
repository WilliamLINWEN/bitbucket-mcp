import type { BitbucketAPI } from "../bitbucket-api.js";
import * as repositoriesCore from "./repositories.js";
import type { AuthStatusInput, AuthStatusResult } from "./types.js";

function detectAuthMethod(): "token" | "basic" | "none" {
  // Mirror the BitbucketAPI auth-header precedence (see src/core/auth.ts buildHeader):
  //   1. username + apiToken      → Basic ("basic")
  //   2. apiToken alone           → Bearer ("token")
  //   3. username + appPassword   → Basic ("basic")
  //   4. otherwise                → "none"
  // Keeps the reported method consistent with the Authorization header actually sent.
  const username = process.env.BITBUCKET_USERNAME;
  const apiToken = process.env.BITBUCKET_API_TOKEN;
  const appPassword = process.env.BITBUCKET_APP_PASSWORD;
  if (username && apiToken) return "basic";
  if (apiToken) return "token";
  if (username && appPassword) return "basic";
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

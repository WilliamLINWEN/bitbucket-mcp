import { BitbucketAPI } from "../bitbucket-api.js";
import { EnvAuthProvider } from "../core/auth.js";

export function createApiClient(): BitbucketAPI {
  return new BitbucketAPI(new EnvAuthProvider());
}

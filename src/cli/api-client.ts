import { BitbucketAPI } from "../bitbucket-api.js";
import { EnvAuthProvider, hasAnyEnvCred } from "../core/auth.js";
import { CliError, AUTH_HINT } from "./errors.js";

/**
 * Construct a BitbucketAPI client backed by EnvAuthProvider.
 *
 * Pre-flight check: if no Bitbucket credentials are present in the environment,
 * throw a CliError with AUTH_HINT before any API call is attempted. The
 * `hasAnyEnvCred` predicate lives in `core/auth.ts` next to `buildHeader` so
 * the auth precedence has a single source of truth.
 *
 * Pass `{ allowMissingCreds: true }` to skip the pre-flight check (used by
 * `bb auth status`, which must be able to *report* the missing-creds state
 * rather than fail).
 */
export function createApiClient(opts: { allowMissingCreds?: boolean } = {}): BitbucketAPI {
  if (!opts.allowMissingCreds && !hasAnyEnvCred()) {
    throw new CliError(`No Bitbucket credentials in environment.\n${AUTH_HINT}`, 2);
  }
  return new BitbucketAPI(new EnvAuthProvider());
}

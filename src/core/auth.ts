export interface AuthProvider {
  getAuthHeader(): Promise<string | null>;
  isAuthenticated(): Promise<boolean>;
}

export interface StaticCredentials {
  username?: string;
  appPassword?: string;
  apiToken?: string;
}

function buildHeader(creds: StaticCredentials): string | null {
  // Precedence MUST match the original BitbucketAPI implementation:
  //   1. username + apiToken  → Basic base64(username:apiToken)
  //   2. apiToken             → Bearer apiToken
  //   3. username + appPassword → Basic base64(username:appPassword)
  //   4. otherwise            → null
  if (creds.username && creds.apiToken) {
    return "Basic " + Buffer.from(`${creds.username}:${creds.apiToken}`).toString("base64");
  }
  if (creds.apiToken) {
    return `Bearer ${creds.apiToken}`;
  }
  if (creds.username && creds.appPassword) {
    return "Basic " + Buffer.from(`${creds.username}:${creds.appPassword}`).toString("base64");
  }
  return null;
}

/** Returns true if BITBUCKET_API_TOKEN is set in the environment. */
export function hasEnvApiToken(): boolean {
  return !!process.env.BITBUCKET_API_TOKEN;
}

/**
 * Returns true if BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD are both set
 * in the environment.
 */
export function hasEnvAppPasswordPair(): boolean {
  return !!(process.env.BITBUCKET_USERNAME && process.env.BITBUCKET_APP_PASSWORD);
}

/**
 * Returns true if `EnvAuthProvider` would be able to construct a non-null auth
 * header from the current `process.env`.
 *
 * Disjunction of the two atomic predicates: either an API token alone is
 * sufficient (Bearer or Basic+username), or a username + app-password pair is
 * sufficient.
 *
 * Used by `cli/api-client.ts` for the pre-flight check.
 */
export function hasAnyEnvCred(): boolean {
  return hasEnvApiToken() || hasEnvAppPasswordPair();
}

export class StaticAuthProvider implements AuthProvider {
  constructor(private readonly creds: StaticCredentials) {}
  async getAuthHeader(): Promise<string | null> {
    return buildHeader(this.creds);
  }
  async isAuthenticated(): Promise<boolean> {
    return (await this.getAuthHeader()) !== null;
  }
}

export class EnvAuthProvider implements AuthProvider {
  async getAuthHeader(): Promise<string | null> {
    return buildHeader({
      username: process.env.BITBUCKET_USERNAME,
      appPassword: process.env.BITBUCKET_APP_PASSWORD,
      apiToken: process.env.BITBUCKET_API_TOKEN,
    });
  }
  async isAuthenticated(): Promise<boolean> {
    return (await this.getAuthHeader()) !== null;
  }
}

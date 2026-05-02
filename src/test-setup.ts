// Default test env: provide a placeholder credential so tests that drive
// CLI commands via createApiClient() don't trip the pre-flight check added
// when 401/403 hint enrichment landed.
//
// Files that exercise missing-cred behavior (e.g. api-client.test.ts)
// explicitly delete this var inside their own beforeEach/afterEach.
//
// `??=` is used so CI/dev environments with real creds aren't clobbered.
process.env.BITBUCKET_API_TOKEN ??= "test-token";

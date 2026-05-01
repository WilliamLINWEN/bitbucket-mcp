import type { BitbucketAPI, Repository } from "../bitbucket-api.js";
import { recordError, createApiErrorContext } from "../error-context.js";
import type {
  SearchInput,
  SearchResult,
  SearchSectionMeta,
  SearchHit,
} from "./types.js";
import type { PullRequest, Issue, Commit } from "../bitbucket-api.js";

/**
 * Derive the URL-safe repo slug from a Repository object.
 * Uses the second segment of `full_name` ("workspace/slug"), falling back to
 * `name` if `full_name` has an unexpected shape.
 */
function getRepoSlug(repo: Repository): string {
  const parts = repo.full_name.split("/");
  return parts[1] ?? repo.name;
}

export async function search(
  api: BitbucketAPI,
  input: SearchInput,
): Promise<SearchResult> {
  const { workspace, query, types, limit } = input;

  const hits: SearchResult["hits"] = {
    repositories: [],
    pullRequests: [],
    issues: [],
    commits: [],
  };
  const sections: SearchSectionMeta[] = [];

  // Lazy-memoized repository list — fetched at most once per invocation
  let cachedRepos: Awaited<ReturnType<typeof api.listRepositories>> | null = null;
  let cachedReposError: Error | null = null;
  const getRepos = async () => {
    if (cachedReposError) throw cachedReposError;
    if (cachedRepos) return cachedRepos;
    try {
      // TODO(#56-followup): paginate beyond first page; currently misses matches on later pages.
      cachedRepos = await api.listRepositories(workspace, { pagelen: 100 });
      return cachedRepos;
    } catch (error) {
      cachedReposError = error instanceof Error ? error : new Error(String(error));
      throw cachedReposError;
    }
  };

  // Search repositories
  if (types.includes("repositories")) {
    try {
      const repoResult = await getRepos();
      const repos = repoResult.repositories;
      const matchingRepos = repos.filter((repo) =>
        repo.name.toLowerCase().includes(query.toLowerCase()) ||
        (repo.description && repo.description.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, limit);

      for (const repo of matchingRepos) {
        hits.repositories.push({ type: "repositories", repo: getRepoSlug(repo), item: repo });
      }

      sections.push({
        type: "repositories",
        searched: repos.length,
        totalRepos: repos.length,
        hasMoreRepos: !!repoResult.next,
        errors: [],
      });
    } catch (error) {
      sections.push({
        type: "repositories",
        searched: 0,
        totalRepos: 0,
        hasMoreRepos: false,
        errors: [{ repo: "(workspace)", message: error instanceof Error ? error.message : "Unknown error" }],
      });
    }
  }

  // Search pull requests
  if (types.includes("pull-requests")) {
    try {
      const repoResult = await getRepos();
      const repos = repoResult.repositories;
      let prCount = 0;
      let prIterCount = 0;
      const errors: Array<{ repo: string; message: string }> = [];

      for (const repo of repos) {
        if (prCount >= limit) break;
        prIterCount++;
        const slug = getRepoSlug(repo);
        try {
          // TODO(#56-followup): paginate beyond first page; currently misses matches on later pages.
          const prResult = await api.getPullRequests(workspace, slug, undefined, undefined, undefined);
          const matchingPRs = prResult.pullRequests.filter((pr) =>
            pr.title.toLowerCase().includes(query.toLowerCase()) ||
            (pr.description && pr.description.toLowerCase().includes(query.toLowerCase()))
          ).slice(0, limit - prCount);

          for (const pr of matchingPRs) {
            hits.pullRequests.push({ type: "pull-requests", repo: slug, item: pr });
          }
          prCount += matchingPRs.length;
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          errors.push({ repo: slug, message: msg });
          recordError(
            error instanceof Error ? error : new Error(msg),
            "getPullRequests",
            "search-tool",
            createApiErrorContext(`/repositories/${workspace}/${slug}/pullrequests`, "GET", { metadata: { workspace, repository: slug } }),
          );
        }
      }

      sections.push({
        type: "pull-requests",
        searched: prIterCount,
        totalRepos: repos.length,
        hasMoreRepos: !!repoResult.next,
        errors,
      });
    } catch (error) {
      sections.push({
        type: "pull-requests",
        searched: 0,
        totalRepos: 0,
        hasMoreRepos: false,
        errors: [{ repo: "(workspace)", message: error instanceof Error ? error.message : "Unknown error" }],
      });
    }
  }

  // Search issues
  if (types.includes("issues")) {
    try {
      const repoResult = await getRepos();
      const repos = repoResult.repositories;
      let issueCount = 0;
      let issueIterCount = 0;
      const errors: Array<{ repo: string; message: string }> = [];

      for (const repo of repos) {
        if (issueCount >= limit) break;
        issueIterCount++;
        const slug = getRepoSlug(repo);
        try {
          // TODO(#56-followup): paginate beyond first page; currently misses matches on later pages.
          const issueResult = await api.getIssues(workspace, slug, undefined, undefined, undefined);
          const matchingIssues = issueResult.issues.filter((issue) =>
            issue.title.toLowerCase().includes(query.toLowerCase()) ||
            (issue.content?.raw && issue.content.raw.toLowerCase().includes(query.toLowerCase()))
          ).slice(0, limit - issueCount);

          for (const issue of matchingIssues) {
            hits.issues.push({ type: "issues", repo: slug, item: issue });
          }
          issueCount += matchingIssues.length;
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          errors.push({ repo: slug, message: msg });
          recordError(
            error instanceof Error ? error : new Error(msg),
            "getIssues",
            "search-tool",
            createApiErrorContext(`/repositories/${workspace}/${slug}/issues`, "GET", { metadata: { workspace, repository: slug } }),
          );
        }
      }

      sections.push({
        type: "issues",
        searched: issueIterCount,
        totalRepos: repos.length,
        hasMoreRepos: !!repoResult.next,
        errors,
      });
    } catch (error) {
      sections.push({
        type: "issues",
        searched: 0,
        totalRepos: 0,
        hasMoreRepos: false,
        errors: [{ repo: "(workspace)", message: error instanceof Error ? error.message : "Unknown error" }],
      });
    }
  }

  // Search commits
  if (types.includes("commits")) {
    try {
      const repoResult = await getRepos();
      const repos = repoResult.repositories;
      let commitCount = 0;
      let commitIterCount = 0;
      const errors: Array<{ repo: string; message: string }> = [];

      for (const repo of repos) {
        if (commitCount >= limit) break;
        commitIterCount++;
        const slug = getRepoSlug(repo);
        try {
          // TODO(#56-followup): paginate beyond first page; currently misses matches on later pages.
          const commitResult = await api.getCommits(workspace, slug, undefined, undefined, undefined);
          const matchingCommits = commitResult.commits.filter((commit) =>
            commit.message.toLowerCase().includes(query.toLowerCase())
          ).slice(0, limit - commitCount);

          for (const commit of matchingCommits) {
            hits.commits.push({ type: "commits", repo: slug, item: commit });
          }
          commitCount += matchingCommits.length;
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          errors.push({ repo: slug, message: msg });
          recordError(
            error instanceof Error ? error : new Error(msg),
            "getCommits",
            "search-tool",
            createApiErrorContext(`/repositories/${workspace}/${slug}/commits`, "GET", { metadata: { workspace, repository: slug } }),
          );
        }
      }

      sections.push({
        type: "commits",
        searched: commitIterCount,
        totalRepos: repos.length,
        hasMoreRepos: !!repoResult.next,
        errors,
      });
    } catch (error) {
      sections.push({
        type: "commits",
        searched: 0,
        totalRepos: 0,
        hasMoreRepos: false,
        errors: [{ repo: "(workspace)", message: error instanceof Error ? error.message : "Unknown error" }],
      });
    }
  }

  // Determine totalRepos from any section (they all fetch the same repo page)
  const firstSection = sections[0];
  const totalRepos = firstSection?.totalRepos ?? 0;
  const hasMoreRepos = firstSection?.hasMoreRepos ?? false;

  const totalHits =
    hits.repositories.length +
    hits.pullRequests.length +
    hits.issues.length +
    hits.commits.length;

  return {
    workspace,
    query,
    totalRepos,
    hasMoreRepos,
    hits,
    sections,
    totalHits,
  };
}

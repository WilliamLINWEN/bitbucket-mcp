import fetch, { RequestInit } from "node-fetch";
import { recordError, createApiErrorContext } from "./error-context.js";

// Bitbucket API configuration
const BITBUCKET_API_BASE = "https://api.bitbucket.org/2.0";
const USER_AGENT = "bitbucket-mcp-server/1.0";

// Type definitions for Bitbucket API responses
export interface Repository {
  uuid: string;
  name: string;
  full_name: string;
  description?: string;
  is_private: boolean;
  created_on: string;
  updated_on: string;
  language?: string;
  size: number;
  owner: {
    display_name: string;
    username: string;
  };
  links: {
    html: { href: string };
    clone: Array<{ name: string; href: string }>;
  };
}

export interface PullRequest {
  id: number;
  title: string;
  description?: string;
  state: string;
  created_on: string;
  updated_on: string;
  author: {
    display_name: string;
    username: string;
  };
  source: {
    branch: { name: string };
    repository: { full_name: string };
  };
  destination: {
    branch: { name: string };
    repository: { full_name: string };
  };
  links: {
    html: { href: string };
  };
}

export interface Issue {
  id: number;
  title: string;
  content?: {
    raw: string;
  };
  state: string;
  priority: string;
  kind: string;
  created_on: string;
  updated_on: string;
  reporter: {
    display_name: string;
    username: string;
  };
  assignee?: {
    display_name: string;
    username: string;
  };
  links: {
    html: { href: string };
  };
}

export interface Branch {
  name: string;
  target: {
    hash: string;
    author: {
      raw: string;
    };
    message: string;
    date: string;
  };
  links: {
    html: { href: string };
  };
}

export interface Commit {
  hash: string;
  message: string;
  author: {
    raw: string;
    user?: {
      display_name: string;
      username: string;
    };
  };
  date: string;
  parents: Array<{ hash: string }>;
  links: {
    html: { href: string };
  };
}

export interface Pipeline {
  uuid: string;
  build_number: number;
  creator?: {
    display_name: string;
    username: string;
  };
  repository?: {
    full_name: string;
    name: string;
  };
  target?: {
    type: string;
    ref_type?: string;
    ref_name?: string;
    selector?: {
      type: string;
      pattern: string;
    };
    commit?: {
      hash: string;
    };
  };
  trigger?: {
    type: string;
    name?: string;
  };
  variables?: Array<{
    type?: string;
    key: string;
    value?: string;
    secured?: boolean;
  }>;
  state?: {
    name: string;
    result?: {
      name: string;
    };
    stage?: {
      name: string;
    };
  };
  created_on: string;
  updated_on: string;
  completed_on?: string;
  build_seconds_used?: number;
  links?: {
    self?: { href: string };
    html?: { href: string };
  };
}

export interface Comment {
  id: number;
  content: {
    raw: string;
    markup: string;
    html: string;
  };
  user: {
    display_name: string;
    username: string;
    uuid: string;
  };
  created_on: string;
  updated_on: string;
  inline?: {
    path: string;
    from?: number;
    to?: number;
  };
  parent?: {
    id: number;
  };
  links: {
    self: { href: string };
    html: { href: string };
  };
  pullrequest?: {
    id: number;
    title: string;
    links: {
      html: { href: string };
    };
  };
}

export interface PaginatedResponse<T> {
  values: T[];
  next?: string;
  previous?: string;
  page?: number;
  pagelen?: number;
  size?: number;
}

export interface CreatePullRequestParams {
  title: string;
  source_branch: string;
  destination_branch?: string;
  description?: string;
  close_source_branch?: boolean;
  reviewers?: string[]; // list of account UUIDs
}

export interface RequestOptions {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface ApiError extends Error {
  status?: number;
  statusText?: string;
  url?: string;
}

export class BitbucketAPI {
  private username?: string;
  private appPassword?: string;
  private apiToken?: string;

  constructor(username?: string, appPassword?: string, apiToken?: string) {
    this.username = username || process.env.BITBUCKET_USERNAME;
    this.appPassword = appPassword || process.env.BITBUCKET_APP_PASSWORD;
    this.apiToken = apiToken || process.env.BITBUCKET_API_TOKEN;

    // Log authentication status (without exposing credentials)
    if (this.apiToken) {
      console.error("BitbucketAPI initialized with API Token credentials");
    } else if (this.username && this.appPassword) {
      console.error(`BitbucketAPI initialized with App Password credentials for user: ${this.username}`);
    } else {
      console.error("BitbucketAPI initialized without credentials (public access only)");
    }
  }

  private async makeRequest<T>(url: string, options: RequestInit = {}, requestOptions: RequestOptions = {}): Promise<T> {
    const { retries = 3, retryDelay = 1000, timeout = 30000 } = requestOptions;

    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      "Accept": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    // Add authentication if credentials are available
    if (this.username && this.apiToken) {
      const auth = Buffer.from(`${this.username}:${this.apiToken}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    } else if (this.username && this.appPassword) {
      const auth = Buffer.from(`${this.username}:${this.appPassword}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    console.error(`Making request to: ${url}`);

    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error: ApiError = new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
          error.status = response.status;
          error.statusText = response.statusText;
          error.url = url;

          // Don't retry on client errors (4xx), only on server errors (5xx) or network issues
          if (response.status >= 400 && response.status < 500) {
            console.error(`Client error (${response.status}): ${response.statusText}`);
            throw error;
          }

          lastError = error;
          console.error(`Server error (attempt ${attempt + 1}/${retries + 1}): ${response.status} ${response.statusText}`);

          if (attempt < retries) {
            console.error(`Retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }

          throw error;
        }

        console.error(`Request successful: ${response.status}`);
        return (await response.json()) as T;

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          const timeoutError: ApiError = new Error(`Request timeout after ${timeout}ms`);
          timeoutError.url = url;
          lastError = timeoutError;
        } else if (error instanceof Error) {
          lastError = error as ApiError;
        }

        console.error(`Request failed (attempt ${attempt + 1}/${retries + 1}):`, error);

        if (attempt < retries) {
          console.error(`Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        throw lastError || error;
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  private async makeTextRequest(url: string, options: RequestInit = {}, requestOptions: RequestOptions = {}): Promise<string> {
    const { retries = 3, retryDelay = 1000, timeout = 30000 } = requestOptions;

    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      "Accept": "text/plain",
      ...((options.headers as Record<string, string>) || {}),
    };

    // Add authentication if credentials are available
    if (this.username && this.apiToken) {
      const auth = Buffer.from(`${this.username}:${this.apiToken}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    } else if (this.username && this.appPassword) {
      const auth = Buffer.from(`${this.username}:${this.appPassword}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    console.error(`Making text request to: ${url}`);

    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error: ApiError = new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
          error.status = response.status;
          error.statusText = response.statusText;
          error.url = url;

          // Don't retry on client errors (4xx), only on server errors (5xx) or network issues
          if (response.status >= 400 && response.status < 500) {
            console.error(`Client error (${response.status}): ${response.statusText}`);
            throw error;
          }

          lastError = error;
          console.error(`Server error (attempt ${attempt + 1}/${retries + 1}): ${response.status} ${response.statusText}`);

          if (attempt < retries) {
            console.error(`Retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }

          throw error;
        }

        console.error(`Text request successful: ${response.status}`);
        return await response.text();

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          const timeoutError: ApiError = new Error(`Request timeout after ${timeout}ms`);
          timeoutError.url = url;
          lastError = timeoutError;
        } else if (error instanceof Error) {
          lastError = error as ApiError;
        }

        console.error(`Text request failed (attempt ${attempt + 1}/${retries + 1}):`, error);

        if (attempt < retries) {
          console.error(`Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        throw lastError || error;
      }
    }

    throw lastError || new Error('Text request failed after all retries');
  }

  async listRepositories(
    workspace: string,
    options?: string | { role?: string; sort?: string; page?: string; pagelen?: number }
  ): Promise<{ repositories: Repository[]; hasMore: boolean; next?: string; page?: number; pagelen?: number }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}`;
    let queryOptions: { role?: string; sort?: string; page?: string; pagelen?: number } = {};

    if (typeof options === 'string') {
      queryOptions.page = options;
    } else if (options) {
      queryOptions = options;
    }

    if (queryOptions.page && queryOptions.page.startsWith('http')) {
      url = queryOptions.page;
    } else {
      const queryParams = new URLSearchParams();
      if (queryOptions.role) queryParams.append('role', queryOptions.role);
      if (queryOptions.sort) queryParams.append('sort', queryOptions.sort);
      if (queryOptions.page) queryParams.append('page', queryOptions.page);
      
      const pagelen = queryOptions.pagelen !== undefined ? Math.min(100, Math.max(10, queryOptions.pagelen)) : 10;
      queryParams.append('pagelen', pagelen.toString());

      const queryString = queryParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const response = await this.makeRequest<PaginatedResponse<Repository>>(url);

    return {
      repositories: response.values,
      hasMore: !!response.next,
      next: response.next,
      page: response.page,
      pagelen: response.pagelen
    };
  }

  async getRepository(workspace: string, repoSlug: string): Promise<Repository> {
    const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}`;
    return this.makeRequest<Repository>(url);
  }

  async getPullRequests(
    workspace: string,
    repoSlug: string,
    state?: string | string[],
    page?: string,
    pagelen?: number
  ): Promise<{ pullRequests: PullRequest[]; hasMore: boolean; next?: string; page?: number; pagelen?: number }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests`;

    if (page && page.startsWith('http')) {
      url = page;
    } else {
      const queryParams = new URLSearchParams();
      if (state) {
        const states = Array.isArray(state) ? state : [state];
        for (const s of states) {
          queryParams.append('state', s);
        }
      }
      if (page) queryParams.append('page', page);
      const clampedPagelen = pagelen !== undefined ? Math.min(100, Math.max(10, pagelen)) : 10;
      queryParams.append('pagelen', clampedPagelen.toString());
      url += `?${queryParams.toString()}`;
    }

    const response = await this.makeRequest<PaginatedResponse<PullRequest>>(url);

    return {
      pullRequests: response.values,
      hasMore: !!response.next,
      next: response.next,
      page: response.page,
      pagelen: response.pagelen
    };
  }

  async getPullRequest(workspace: string, repoSlug: string, pullRequestId: number): Promise<PullRequest> {
    const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestId}`;
    return this.makeRequest<PullRequest>(url);
  }

  async updatePullRequest(
    workspace: string,
    repoSlug: string,
    pullRequestId: number,
    updates: { title?: string; description?: string }
  ): Promise<PullRequest> {
    const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestId}`;
    
    // Only send mutable fields to avoid 400 Bad Request from read-only fields
    const payload: Record<string, any> = {};

    if (updates.title !== undefined) {
      payload.title = updates.title;
    }
    if (updates.description !== undefined) {
      payload.description = updates.description;
    }

    return this.makeRequest<PullRequest>(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  }

  async getIssues(
    workspace: string,
    repoSlug: string,
    state?: string,
    page?: string,
    pagelen?: number
  ): Promise<{ issues: Issue[]; hasMore: boolean; next?: string; page?: number; pagelen?: number }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/issues`;

    if (page && page.startsWith('http')) {
      url = page;
    } else {
      const queryParams = new URLSearchParams();
      if (state) queryParams.append('state', state);
      if (page) queryParams.append('page', page);
      const clampedPagelen = pagelen !== undefined ? Math.min(100, Math.max(10, pagelen)) : 10;
      queryParams.append('pagelen', clampedPagelen.toString());
      url += `?${queryParams.toString()}`;
    }

    const response = await this.makeRequest<PaginatedResponse<Issue>>(url);

    return {
      issues: response.values,
      hasMore: !!response.next,
      next: response.next,
      page: response.page,
      pagelen: response.pagelen
    };
  }

  async getBranches(
    workspace: string,
    repoSlug: string,
    page?: string,
    pagelen?: number
  ): Promise<{ branches: Branch[]; hasMore: boolean; next?: string; page?: number; pagelen?: number }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/refs/branches`;

    if (page && page.startsWith('http')) {
      url = page;
    } else {
      const queryParams = new URLSearchParams();
      if (page) queryParams.append('page', page);
      const clampedPagelen = pagelen !== undefined ? Math.min(100, Math.max(10, pagelen)) : 10;
      queryParams.append('pagelen', clampedPagelen.toString());
      url += `?${queryParams.toString()}`;
    }

    const response = await this.makeRequest<PaginatedResponse<Branch>>(url);

    return {
      branches: response.values,
      hasMore: !!response.next,
      next: response.next,
      page: response.page,
      pagelen: response.pagelen
    };
  }

  async getCommits(
    workspace: string,
    repoSlug: string,
    branch?: string,
    page?: string,
    pagelen?: number
  ): Promise<{ commits: Commit[]; hasMore: boolean; next?: string; page?: number; pagelen?: number }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/commits`;

    if (page && page.startsWith('http')) {
      url = page;
    } else {
      if (branch) {
        url += `/${branch}`;
      }
      const queryParams = new URLSearchParams();
      if (page) queryParams.append('page', page);
      const clampedPagelen = pagelen !== undefined ? Math.min(100, Math.max(10, pagelen)) : 10;
      queryParams.append('pagelen', clampedPagelen.toString());
      url += `?${queryParams.toString()}`;
    }

    const response = await this.makeRequest<PaginatedResponse<Commit>>(url);

    return {
      commits: response.values,
      hasMore: !!response.next,
      next: response.next,
      page: response.page,
      pagelen: response.pagelen
    };
  }

  async getPullRequestComments(
    workspace: string,
    repoSlug: string,
    pullRequestId: number,
    options?: string | { page?: string; pagelen?: number }
  ): Promise<{ comments: Comment[]; hasMore: boolean; next?: string; page?: number; pagelen?: number }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestId}/comments`;
    let queryOptions: { page?: string; pagelen?: number } = {};

    if (typeof options === 'string') {
      queryOptions.page = options;
    } else if (options) {
      queryOptions = options;
    }

    if (queryOptions.page && queryOptions.page.startsWith('http')) {
      url = queryOptions.page;
    } else {
      const queryParams = new URLSearchParams();
      if (queryOptions.page) queryParams.append('page', queryOptions.page);
      
      const pagelen = queryOptions.pagelen !== undefined ? Math.min(100, Math.max(10, queryOptions.pagelen)) : 10;
      queryParams.append('pagelen', pagelen.toString());

      const queryString = queryParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const response = await this.makeRequest<PaginatedResponse<Comment>>(url);

    return {
      comments: response.values,
      hasMore: !!response.next,
      next: response.next,
      page: response.page,
      pagelen: response.pagelen
    };
  }

  async getPullRequestComment(workspace: string, repoSlug: string, pullRequestId: number, commentId: number): Promise<Comment> {
    const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestId}/comments/${commentId}`;
    return this.makeRequest<Comment>(url);
  }

  async getPullRequestDiff(workspace: string, repoSlug: string, pullRequestId: number): Promise<string> {
    const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestId}/diff`;
    return this.makeTextRequest(url);
  }

  async createPullRequestComment(
    workspace: string,
    repoSlug: string,
    pullRequestId: number,
    content: string,
    inlineOptions?: {
      path: string;           // The path to the file being commented on (required for inline)
      from?: number;          // The comment's anchor line in the old version of the file
      to?: number;            // The comment's anchor line in the new version of the file
    }
  ): Promise<Comment> {
    const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestId}/comments`;

    const body: any = {
      content: {
        raw: content
      }
    };

    // Add inline comment information if provided
    if (inlineOptions) {
      body.inline = {
        path: inlineOptions.path
      };

      // Add from value if specified (line in old version)
      if (inlineOptions.from !== undefined) {
        body.inline.from = inlineOptions.from;
      }

      // Add to value if specified (line in new version) 
      if (inlineOptions.to !== undefined) {
        body.inline.to = inlineOptions.to;
      }
    }

    const response = await this.makeRequest<Comment>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    return response;
  }

  async createPullRequest(
    workspace: string,
    repoSlug: string,
    params: CreatePullRequestParams
  ): Promise<PullRequest> {
    const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests`;

    const body: Record<string, any> = {
      title: params.title,
      source: {
        branch: { name: params.source_branch }
      }
    };

    if (params.destination_branch !== undefined) {
      body.destination = { branch: { name: params.destination_branch } };
    }

    if (params.description !== undefined) {
      body.description = params.description;
    }

    if (params.close_source_branch !== undefined) {
      body.close_source_branch = params.close_source_branch;
    }

    if (params.reviewers && params.reviewers.length > 0) {
      body.reviewers = params.reviewers.map(uuid => ({ uuid }));
    }

    return this.makeRequest<PullRequest>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  /**
   * Retrieve a specific commit by its hash from a repository.
   * @param workspace Bitbucket workspace name
   * @param repoSlug Repository slug/name
   * @param commitHash Commit hash (full or short)
   * @returns Commit object
   * @throws Error if commitHash is invalid or commit not found
   */
  async getCommit(workspace: string, repoSlug: string, commitHash: string): Promise<Commit> {
    // Validate commitHash: must be at least 7 hex chars
    if (!/^[a-fA-F0-9]{7,40}$/.test(commitHash)) {
      throw new Error(
        `Invalid commit hash: '${commitHash}'. Must be 7-40 hexadecimal characters.`
      );
    }
    const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/commit/${commitHash}`;
    try {
      return await this.makeRequest<Commit>(url);
    } catch (error: any) {
      if (error?.status === 404) {
        throw new Error(`Commit '${commitHash}' not found in '${workspace}/${repoSlug}'.`);
      }
      throw new Error(
        `Failed to retrieve commit '${commitHash}' from '${workspace}/${repoSlug}': ${error?.message || error}`
      );
    }
  }

  /**
   * List pipelines for a repository.
   * @param workspace Bitbucket workspace name
   * @param repoSlug Repository slug/name
   * @param page Page number or next page URL
   * @param pagelen Number of items per page
   * @returns Paginated list of pipelines
   */
  async listPipelines(
    workspace: string,
    repoSlug: string,
    page?: string,
    pagelen?: number
  ): Promise<{ pipelines: Pipeline[]; hasMore: boolean; next?: string; page?: number; pagelen?: number }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pipelines/`;

    if (page && page.startsWith('http')) {
      // Only allow Bitbucket pagination URLs for this repository's pipelines
      let pageUrl: URL;
      let baseUrl: URL;
      try {
        pageUrl = new URL(page);
        baseUrl = new URL(BITBUCKET_API_BASE);
      } catch {
        throw new Error("Invalid page URL for Bitbucket pipelines pagination.");
      }

      const isSameOrigin =
        pageUrl.protocol === baseUrl.protocol &&
        pageUrl.host === baseUrl.host;

      const basePath = baseUrl.pathname.replace(/\/$/, "");
      const expectedPathPrefix = `${basePath}/repositories/${workspace}/${repoSlug}/pipelines`;
      const normalizedPath = pageUrl.pathname.replace(/\/$/, "");
      const isExpectedPath =
        normalizedPath === expectedPathPrefix ||
        normalizedPath.startsWith(`${expectedPathPrefix}/`);

      if (!isSameOrigin || !isExpectedPath) {
        throw new Error("Invalid page URL for Bitbucket pipelines pagination.");
      }

      url = page;
    } else {
      const queryParams = new URLSearchParams();
      if (page) queryParams.append('page', page);
      const clampedPagelen = pagelen !== undefined ? Math.min(100, Math.max(10, pagelen)) : 10;
      queryParams.append('pagelen', clampedPagelen.toString());
      queryParams.append('sort', '-created_on');
      url += `?${queryParams.toString()}`;
    }

    const response = await this.makeRequest<PaginatedResponse<Pipeline>>(url);

    return {
      pipelines: response.values,
      hasMore: !!response.next,
      next: response.next,
      page: response.page,
      pagelen: response.pagelen
    };
  }

  /**
   * Trigger a new pipeline for a repository.
   * @param workspace Bitbucket workspace name
   * @param repoSlug Repository slug/name
   * @param target Pipeline target (branch, tag, or commit)
   * @returns Created pipeline object
   */
  async triggerPipeline(
    workspace: string,
    repoSlug: string,
    target: {
      ref_type?: 'branch' | 'tag';
      ref_name?: string;
      commit_hash?: string;
      selector_type?: string;
      selector_pattern?: string;
      variables?: Array<{ key: string; value: string }>;
    }
  ): Promise<Pipeline> {
    const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pipelines/`;

    const body: any = {};

    if (target.ref_type && target.ref_name) {
      body.target = {
        type: 'pipeline_ref_target',
        ref_type: target.ref_type,
        ref_name: target.ref_name
      };
      
      if (target.commit_hash) {
        body.target.commit = {
          type: 'commit',
          hash: target.commit_hash
        };
      }
    } else if (target.commit_hash) {
      body.target = {
        type: 'pipeline_commit_target',
        commit: {
          type: 'commit',
          hash: target.commit_hash
        }
      };
    } else {
      throw new Error('Either (ref_type and ref_name) or commit_hash must be provided');
    }

    if (target.selector_type && target.selector_pattern) {
      body.target.selector = {
        type: target.selector_type,
        pattern: target.selector_pattern
      };
    }

    if (target.variables && target.variables.length > 0) {
      body.variables = target.variables;
    }

    return this.makeRequest<Pipeline>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }
}

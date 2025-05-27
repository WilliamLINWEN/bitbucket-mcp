import fetch, { RequestInit } from "node-fetch";

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
  size?: number;
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

  constructor(username?: string, appPassword?: string) {
    this.username = username || process.env.BITBUCKET_USERNAME;
    this.appPassword = appPassword || process.env.BITBUCKET_APP_PASSWORD;
    
    // Log authentication status (without exposing credentials)
    if (this.username && this.appPassword) {
      console.error(`BitbucketAPI initialized with credentials for user: ${this.username}`);
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
    if (this.username && this.appPassword) {
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
    if (this.username && this.appPassword) {
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

  async listRepositories(workspace: string, page?: string): Promise<{ repositories: Repository[]; hasMore: boolean }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}`;
    if (page) {
      url = page;
    }

    const response = await this.makeRequest<PaginatedResponse<Repository>>(url);
    
    return {
      repositories: response.values,
      hasMore: !!response.next
    };
  }

  async getRepository(workspace: string, repoSlug: string): Promise<Repository> {
    const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}`;
    return this.makeRequest<Repository>(url);
  }

  async getPullRequests(workspace: string, repoSlug: string, state?: string, page?: string): Promise<{ pullRequests: PullRequest[]; hasMore: boolean }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests`;
    if (page) {
      url = page;
    } else if (state) {
      url += `?state=${state}`;
    }

    const response = await this.makeRequest<PaginatedResponse<PullRequest>>(url);
    
    return {
      pullRequests: response.values,
      hasMore: !!response.next
    };
  }

  async getPullRequest(workspace: string, repoSlug: string, pullRequestId: number): Promise<PullRequest> {
    const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestId}`;
    return this.makeRequest<PullRequest>(url);
  }

  async getIssues(workspace: string, repoSlug: string, state?: string, page?: string): Promise<{ issues: Issue[]; hasMore: boolean }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/issues`;
    if (page) {
      url = page;
    } else if (state) {
      url += `?state=${state}`;
    }

    const response = await this.makeRequest<PaginatedResponse<Issue>>(url);
    
    return {
      issues: response.values,
      hasMore: !!response.next
    };
  }

  async getBranches(workspace: string, repoSlug: string, page?: string): Promise<{ branches: Branch[]; hasMore: boolean }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/refs/branches`;
    if (page) {
      url = page;
    }

    const response = await this.makeRequest<PaginatedResponse<Branch>>(url);
    
    return {
      branches: response.values,
      hasMore: !!response.next
    };
  }

  async getCommits(workspace: string, repoSlug: string, branch?: string, page?: string): Promise<{ commits: Commit[]; hasMore: boolean }> {
    let url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/commits`;
    if (page) {
      url = page;
    } else if (branch) {
      url += `/${branch}`;
    }

    const response = await this.makeRequest<PaginatedResponse<Commit>>(url);
    
    return {
      commits: response.values,
      hasMore: !!response.next
    };
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
}

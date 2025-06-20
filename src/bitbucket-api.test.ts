import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-fetch using vi.hoisted to avoid hoisting issues
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('node-fetch', () => ({
  default: mockFetch,
}));

import { BitbucketAPI } from './bitbucket-api.js';

describe('BitbucketAPI', () => {
  let api: BitbucketAPI;

  beforeEach(() => {
    // Mock console.error to avoid noise in tests before creating the API instance
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api = new BitbucketAPI();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listRepositories', () => {
    it('should return repositories for a workspace', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          values: [
            {
              uuid: 'test-uuid',
              name: 'test-repo',
              full_name: 'workspace/test-repo',
              description: 'A test repository',
              is_private: false,
              created_on: '2023-01-01T00:00:00Z',
              updated_on: '2023-01-02T00:00:00Z',
              size: 1024,
              language: 'TypeScript',
              owner: {
                display_name: 'Test User',
                username: 'testuser',
              },
              links: {
                html: { href: 'https://bitbucket.org/workspace/test-repo' },
                clone: [
                  { name: 'https', href: 'https://bitbucket.org/workspace/test-repo.git' },
                  { name: 'ssh', href: 'git@bitbucket.org:workspace/test-repo.git' },
                ],
              },
            }
          ],
          next: null,
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.listRepositories('testworkspace');
      
      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0].name).toBe('test-repo');
      expect(result.hasMore).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/json',
            'User-Agent': 'bitbucket-mcp-server/1.0',
          }),
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should handle authentication when credentials are provided', async () => {
      // Set up authenticated API
      const authenticatedApi = new BitbucketAPI('testuser', 'testpass');
      
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await authenticatedApi.listRepositories('testworkspace');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Basic dGVzdHVzZXI6dGVzdHBhc3M=', // base64 of testuser:testpass
          }),
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      const errorResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue({ error: { message: 'Workspace not found' } }),
      };
      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.listRepositories('nonexistent')).rejects.toThrow();
    });
  });

  describe('getRepository', () => {
    it('should return repository details', async () => {
      const mockRepo = {
        uuid: 'test-uuid',
        name: 'test-repo',
        full_name: 'workspace/test-repo',
        description: 'A test repository',
        is_private: false,
        created_on: '2023-01-01T00:00:00Z',
        updated_on: '2023-01-02T00:00:00Z',
        size: 1024,
        language: 'TypeScript',
        owner: {
          display_name: 'Test User',
          username: 'testuser',
        },
        links: {
          html: { href: 'https://bitbucket.org/workspace/test-repo' },
          clone: [
            { name: 'https', href: 'https://bitbucket.org/workspace/test-repo.git' },
            { name: 'ssh', href: 'git@bitbucket.org:workspace/test-repo.git' },
          ],
        },
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockRepo),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getRepository('testworkspace', 'test-repo');
      
      expect(result).toEqual(mockRepo);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo',
        expect.any(Object)
      );
    });
  });

  describe('getPullRequest', () => {
    it('should return pull request details', async () => {
      const mockPullRequest = {
        id: 123,
        title: 'Fix critical bug',
        state: 'OPEN',
        author: {
          display_name: 'John Doe',
          username: 'johndoe',
        },
        created_on: '2023-12-01T10:00:00Z',
        updated_on: '2023-12-01T15:30:00Z',
        source: {
          branch: {
            name: 'feature/fix-bug',
          },
          repository: {
            name: 'test-repo',
          },
        },
        destination: {
          branch: {
            name: 'main',
          },
          repository: {
            name: 'test-repo',
          },
        },
        links: {
          html: {
            href: 'https://bitbucket.org/workspace/test-repo/pull-requests/123',
          },
        },
        description: 'This PR fixes a critical bug in the authentication system.',
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockPullRequest),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getPullRequest('testworkspace', 'test-repo', 123);
      
      expect(result).toEqual(mockPullRequest);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests/123',
        expect.any(Object)
      );
    });

    it('should handle pull request not found error', async () => {
      const errorResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue({ error: { message: 'Pull request not found' } }),
      };
      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.getPullRequest('testworkspace', 'test-repo', 999)).rejects.toThrow();
    });

    it('should handle authentication when getting pull request', async () => {
      const authenticatedApi = new BitbucketAPI('testuser', 'testpass');
      
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: 123,
          title: 'Test PR',
          state: 'OPEN',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await authenticatedApi.getPullRequest('testworkspace', 'test-repo', 123);
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests/123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Basic dGVzdHVzZXI6dGVzdHBhc3M=',
          }),
        })
      );
    });
  });

  describe('createPullRequestComment', () => {
    it('should create a comment on a pull request', async () => {
      const mockComment = {
        id: 456,
        content: {
          raw: 'This is a test comment',
          markup: 'markdown',
          html: '<p>This is a test comment</p>',
        },
        user: {
          display_name: 'Test User',
          username: 'testuser',
          uuid: '{user-uuid}',
        },
        created_on: '2023-01-01T12:00:00Z',
        updated_on: '2023-01-01T12:00:00Z',
        links: {
          self: { href: 'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests/123/comments/456' },
          html: { href: 'https://bitbucket.org/testworkspace/test-repo/pull-requests/123/#comment-456' },
        },
        pullrequest: {
          id: 123,
          title: 'Test PR',
          links: {
            html: { href: 'https://bitbucket.org/testworkspace/test-repo/pull-requests/123' },
          },
        },
      };

      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue(mockComment),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.createPullRequestComment('testworkspace', 'test-repo', 123, 'This is a test comment');

      expect(result).toEqual(mockComment);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests/123/comments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            content: {
              raw: 'This is a test comment',
            },
          }),
        })
      );
    });

    it('should handle authentication when creating a comment', async () => {
      const authenticatedApi = new BitbucketAPI('testuser', 'testpass');
      
      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({
          id: 456,
          content: { raw: 'Test comment' },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await authenticatedApi.createPullRequestComment('testworkspace', 'test-repo', 123, 'Test comment');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests/123/comments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Basic dGVzdHVzZXI6dGVzdHBhc3M=',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle errors when creating a comment', async () => {
      const errorResponse = {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: vi.fn().mockResolvedValue({ error: { message: 'Access denied' } }),
      };
      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.createPullRequestComment('testworkspace', 'test-repo', 123, 'Test comment')).rejects.toThrow();
    });

    it('should create an inline comment on a file', async () => {
      const mockComment = {
        id: 789,
        content: {
          raw: 'This is an inline comment',
          markup: 'markdown',
          html: '<p>This is an inline comment</p>',
        },
        user: {
          display_name: 'Test User',
          username: 'testuser',
          uuid: '{user-uuid}',
        },
        created_on: '2023-01-01T12:00:00Z',
        updated_on: '2023-01-01T12:00:00Z',
        inline: {
          path: 'src/test.js',
          to: 42
        },
        links: {
          self: { href: 'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests/123/comments/789' },
          html: { href: 'https://bitbucket.org/testworkspace/test-repo/pull-requests/123/#comment-789' },
        }
      };

      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue(mockComment),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const inlineOptions = {
        path: 'src/test.js',
        to: 42
      };

      const result = await api.createPullRequestComment(
        'testworkspace', 
        'test-repo', 
        123, 
        'This is an inline comment',
        inlineOptions
      );

      expect(result).toEqual(mockComment);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests/123/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            content: {
              raw: 'This is an inline comment',
            },
            inline: {
              path: 'src/test.js',
              to: 42
            }
          }),
        })
      );
    });

    it('should create an inline comment on old version of a file', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({
          id: 790,
          content: { raw: 'Comment on old version' },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const inlineOptions = {
        path: 'src/test.js',
        from: 10
      };

      await api.createPullRequestComment(
        'testworkspace', 
        'test-repo', 
        123, 
        'Comment on old version',
        inlineOptions
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests/123/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            content: {
              raw: 'Comment on old version',
            },
            inline: {
              path: 'src/test.js',
              from: 10
            }
          }),
        })
      );
    });

    it('should create an inline comment with both from and to values', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({
          id: 791,
          content: { raw: 'Comment on change between versions' },
          inline: {
            path: 'src/main.ts',
            from: 25,
            to: 28
          }
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const inlineOptions = {
        path: 'src/main.ts',
        from: 25,
        to: 28
      };

      await api.createPullRequestComment(
        'testworkspace', 
        'test-repo', 
        123, 
        'Comment on change between versions',
        inlineOptions
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests/123/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            content: {
              raw: 'Comment on change between versions',
            },
            inline: {
              path: 'src/main.ts',
              from: 25,
              to: 28
            }
          }),
        })
      );
    });
  });
});

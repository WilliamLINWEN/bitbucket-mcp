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
    vi.spyOn(console, 'error').mockImplementation(() => { });
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
        'https://api.bitbucket.org/2.0/repositories/testworkspace?pagelen=10',
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
        'https://api.bitbucket.org/2.0/repositories/testworkspace?pagelen=10',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Basic dGVzdHVzZXI6dGVzdHBhc3M=', // base64 of testuser:testpass
          }),
        })
      );
    });

    it('should handle authentication when apiToken but no username is provided', async () => {
      // Set up API token authenticated API
      const authenticatedApi = new BitbucketAPI(undefined, undefined, 'testtoken');

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await authenticatedApi.listRepositories('testworkspace');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace?pagelen=10',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer testtoken',
          }),
        })
      );
    });

    it('should handle base64 basic auth when both username and apiToken are provided', async () => {
      // Set up API token authenticated API with username
      const authenticatedApi = new BitbucketAPI('testuser', undefined, 'testtoken');

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await authenticatedApi.listRepositories('testworkspace');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace?pagelen=10',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Basic dGVzdHVzZXI6dGVzdHRva2Vu', // Base64 for testuser:testtoken
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

    it('should return pagination metadata for repositories', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          values: [],
          page: 1,
          pagelen: 10,
          next: 'https://api.bitbucket.org/2.0/repositories/testworkspace?page=2',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.listRepositories('testworkspace');

      expect(result.hasMore).toBe(true);
      expect(result.next).toBe('https://api.bitbucket.org/2.0/repositories/testworkspace?page=2');
      expect(result.page).toBe(1);
      expect(result.pagelen).toBe(10);
    });

    it('should honor custom repository pagelen values above the default minimum', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null, pagelen: 25 }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.listRepositories('testworkspace', { pagelen: 25 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace?pagelen=25',
        expect.any(Object)
      );
    });

    it('should clamp repository pagelen to the Bitbucket minimum', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null, pagelen: 10 }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.listRepositories('testworkspace', { pagelen: 1 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace?pagelen=10',
        expect.any(Object)
      );
    });

    it('should treat repository next page URLs as opaque', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.listRepositories(
        'testworkspace',
        'https://api.bitbucket.org/2.0/repositories/testworkspace?page=2&pagelen=50'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace?page=2&pagelen=50',
        expect.any(Object)
      );
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

  describe('updatePullRequest', () => {
    it('should update a pull request title and description successfully', async () => {
      const mockUpdatedPr = {
        id: 123,
        title: 'New Title',
        description: 'New description',
        state: 'OPEN',
        author: { display_name: 'Test User', username: 'testuser' },
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockUpdatedPr),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.updatePullRequest('testworkspace', 'test-repo', 123, {
        title: 'New Title',
        description: 'New description',
      });

      expect(result).toEqual(mockUpdatedPr);
      
      // Verify only one PUT call (no GET)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests/123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            title: 'New Title',
            description: 'New description',
          }),
        })
      );
    });

    it('should only update provided fields', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ id: 123, description: 'New description' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.updatePullRequest('testworkspace', 'test-repo', 123, {
        description: 'New description',
      });

      // Payload should only contain description, not title
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests/123',
        expect.objectContaining({
          body: JSON.stringify({
            description: 'New description',
          }),
        })
      );
    });

    it('should handle authentication when updating pull request', async () => {
      const authenticatedApi = new BitbucketAPI('testuser', 'testpass');
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ id: 123 }),
      });

      await authenticatedApi.updatePullRequest('testworkspace', 'test-repo', 123, { title: 'New' });
      
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

  describe('getPullRequestComments', () => {
    it('should return comments for a pull request', async () => {
      const mockComments = [
        {
          id: 100,
          content: { raw: 'Looks good!', markup: 'markdown', html: '<p>Looks good!</p>' },
          user: { display_name: 'Reviewer', username: 'reviewer', uuid: '{reviewer-uuid}' },
          created_on: '2023-12-01T10:00:00Z',
          updated_on: '2023-12-01T10:00:00Z',
          links: {
            self: { href: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments/100' },
            html: { href: 'https://bitbucket.org/ws/repo/pull-requests/1/#comment-100' },
          },
        },
        {
          id: 101,
          content: { raw: 'Fix this line', markup: 'markdown', html: '<p>Fix this line</p>' },
          user: { display_name: 'Reviewer', username: 'reviewer', uuid: '{reviewer-uuid}' },
          created_on: '2023-12-01T11:00:00Z',
          updated_on: '2023-12-01T11:00:00Z',
          inline: { path: 'src/main.ts', to: 42 },
          links: {
            self: { href: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments/101' },
            html: { href: 'https://bitbucket.org/ws/repo/pull-requests/1/#comment-101' },
          },
        },
      ];

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: mockComments, next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getPullRequestComments('ws', 'repo', 1);

      expect(result.comments).toHaveLength(2);
      expect(result.comments[0].id).toBe(100);
      expect(result.comments[1].inline?.path).toBe('src/main.ts');
      expect(result.hasMore).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments?pagelen=10',
        expect.any(Object)
      );
    });

    it('should handle empty comments list', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getPullRequestComments('ws', 'repo', 1);

      expect(result.comments).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          values: [{ id: 200, content: { raw: 'comment' } }],
          page: 1,
          pagelen: 10,
          next: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments?page=2',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getPullRequestComments('ws', 'repo', 1);

      expect(result.hasMore).toBe(true);
      expect(result.next).toBe('https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments?page=2');
      expect(result.page).toBe(1);
      expect(result.pagelen).toBe(10);
    });

    it('should honor custom pagelen values above the default minimum', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null, pagelen: 25 }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getPullRequestComments('ws', 'repo', 1, { pagelen: 25 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments?pagelen=25',
        expect.any(Object)
      );
    });

    it('should clamp pagelen to the Bitbucket minimum', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null, pagelen: 10 }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getPullRequestComments('ws', 'repo', 1, { pagelen: 1 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments?pagelen=10',
        expect.any(Object)
      );
    });

    it('should treat next page URLs as opaque', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getPullRequestComments(
        'ws',
        'repo',
        1,
        { page: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments?page=2&pagelen=50' }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments?page=2&pagelen=50',
        expect.any(Object)
      );
    });
  });

  describe('createPullRequest', () => {
    const mockPR = {
      id: 42,
      title: 'My feature PR',
      state: 'OPEN',
      description: 'Some description',
      created_on: '2024-01-01T00:00:00Z',
      updated_on: '2024-01-01T00:00:00Z',
      author: { display_name: 'Test User', username: 'testuser' },
      source: { branch: { name: 'feature/my-branch' }, repository: { full_name: 'workspace/repo' } },
      destination: { branch: { name: 'main' }, repository: { full_name: 'workspace/repo' } },
      links: { html: { href: 'https://bitbucket.org/workspace/repo/pull-requests/42' } },
    };

    it('should create a pull request with required fields only', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue(mockPR),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.createPullRequest('testworkspace', 'test-repo', {
        title: 'My feature PR',
        source_branch: 'feature/my-branch',
      });

      expect(result).toEqual(mockPR);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            title: 'My feature PR',
            source: { branch: { name: 'feature/my-branch' } },
          }),
        })
      );
    });

    it('should create a pull request with all optional fields', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue(mockPR),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.createPullRequest('testworkspace', 'test-repo', {
        title: 'My feature PR',
        source_branch: 'feature/my-branch',
        destination_branch: 'main',
        description: 'Some description',
        close_source_branch: true,
        reviewers: ['{uuid-1}', '{uuid-2}'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: 'My feature PR',
            source: { branch: { name: 'feature/my-branch' } },
            destination: { branch: { name: 'main' } },
            description: 'Some description',
            close_source_branch: true,
            reviewers: [{ uuid: '{uuid-1}' }, { uuid: '{uuid-2}' }],
          }),
        })
      );
    });

    it('should send authentication header when creating a pull request', async () => {
      const authenticatedApi = new BitbucketAPI('testuser', 'testpass');
      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue(mockPR),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await authenticatedApi.createPullRequest('testworkspace', 'test-repo', {
        title: 'My feature PR',
        source_branch: 'feature/my-branch',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo/pullrequests',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Basic dGVzdHVzZXI6dGVzdHBhc3M=',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should reject on API error when creating a pull request', async () => {
      const errorResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({ error: { message: 'Branch does not exist' } }),
      };
      mockFetch.mockResolvedValue(errorResponse);

      await expect(
        api.createPullRequest('testworkspace', 'test-repo', {
          title: 'Bad PR',
          source_branch: 'nonexistent-branch',
        })
      ).rejects.toThrow();
    });
  });

  describe('getPullRequestComment', () => {
    it('should return a specific comment by ID', async () => {
      const mockComment = {
        id: 456,
        content: { raw: 'Detailed comment', markup: 'markdown', html: '<p>Detailed comment</p>' },
        user: { display_name: 'Test User', username: 'testuser', uuid: '{user-uuid}' },
        created_on: '2023-12-01T10:00:00Z',
        updated_on: '2023-12-01T10:00:00Z',
        inline: { path: 'src/index.ts', from: 10, to: 15 },
        parent: { id: 100 },
        links: {
          self: { href: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments/456' },
          html: { href: 'https://bitbucket.org/ws/repo/pull-requests/1/#comment-456' },
        },
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockComment),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getPullRequestComment('ws', 'repo', 1, 456);

      expect(result).toEqual(mockComment);
      expect(result.inline?.path).toBe('src/index.ts');
      expect(result.parent?.id).toBe(100);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments/456',
        expect.any(Object)
      );
    });

    it('should handle comment not found error', async () => {
      const errorResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue({ error: { message: 'Comment not found' } }),
      };
      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.getPullRequestComment('ws', 'repo', 1, 999)).rejects.toThrow();
    });
  });

  describe('getPullRequests', () => {
    it('should return pull requests with pagination metadata', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          values: [{ id: 1, title: 'Test PR', state: 'OPEN' }],
          page: 1,
          pagelen: 10,
          next: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests?page=2',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getPullRequests('ws', 'repo');

      expect(result.pullRequests).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.next).toBe('https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests?page=2');
      expect(result.page).toBe(1);
      expect(result.pagelen).toBe(10);
    });

    it('should use opaque next URL directly when page starts with http', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getPullRequests(
        'ws',
        'repo',
        undefined,
        'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests?page=3&pagelen=25'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests?page=3&pagelen=25',
        expect.any(Object)
      );
    });

    it('should include state filter when page is not an opaque URL', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getPullRequests('ws', 'repo', 'OPEN');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests?state=OPEN&pagelen=10',
        expect.any(Object)
      );
    });

    it('should support multiple state values as repeated query parameters', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getPullRequests('ws', 'repo', ['OPEN', 'MERGED']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests?state=OPEN&state=MERGED&pagelen=10',
        expect.any(Object)
      );
    });

    it('should clamp pull request pagelen to Bitbucket minimum', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getPullRequests('ws', 'repo', undefined, undefined, 1);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests?pagelen=10',
        expect.any(Object)
      );
    });

    it('should honor custom pull request pagelen within range', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getPullRequests('ws', 'repo', undefined, undefined, 50);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests?pagelen=50',
        expect.any(Object)
      );
    });
  });

  describe('getIssues', () => {
    it('should return issues with pagination metadata', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          values: [{ id: 10, title: 'Test Issue', state: 'open', kind: 'bug' }],
          page: 1,
          pagelen: 10,
          next: 'https://api.bitbucket.org/2.0/repositories/ws/repo/issues?page=2',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getIssues('ws', 'repo');

      expect(result.issues).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.next).toBe('https://api.bitbucket.org/2.0/repositories/ws/repo/issues?page=2');
      expect(result.page).toBe(1);
      expect(result.pagelen).toBe(10);
    });

    it('should use opaque next URL directly when page starts with http', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getIssues(
        'ws',
        'repo',
        undefined,
        'https://api.bitbucket.org/2.0/repositories/ws/repo/issues?page=2&pagelen=25'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/issues?page=2&pagelen=25',
        expect.any(Object)
      );
    });

    it('should include state filter when page is not an opaque URL', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getIssues('ws', 'repo', 'open');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/issues?state=open&pagelen=10',
        expect.any(Object)
      );
    });

    it('should clamp issue pagelen to Bitbucket minimum', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getIssues('ws', 'repo', undefined, undefined, 1);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/issues?pagelen=10',
        expect.any(Object)
      );
    });
  });

  describe('getBranches', () => {
    it('should return branches with pagination metadata', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          values: [{ name: 'main', target: { hash: 'abc123', author: { raw: 'Test' }, message: 'Init', date: '2023-01-01' }, links: { html: { href: 'https://bitbucket.org' } } }],
          page: 1,
          pagelen: 10,
          next: 'https://api.bitbucket.org/2.0/repositories/ws/repo/refs/branches?page=2',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getBranches('ws', 'repo');

      expect(result.branches).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.next).toBe('https://api.bitbucket.org/2.0/repositories/ws/repo/refs/branches?page=2');
      expect(result.page).toBe(1);
      expect(result.pagelen).toBe(10);
    });

    it('should use opaque next URL directly when page starts with http', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getBranches(
        'ws',
        'repo',
        'https://api.bitbucket.org/2.0/repositories/ws/repo/refs/branches?page=3&pagelen=25'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/refs/branches?page=3&pagelen=25',
        expect.any(Object)
      );
    });

    it('should include default pagelen in the request URL', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getBranches('ws', 'repo');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/refs/branches?pagelen=10',
        expect.any(Object)
      );
    });

    it('should clamp branch pagelen to Bitbucket minimum', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getBranches('ws', 'repo', undefined, 1);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/refs/branches?pagelen=10',
        expect.any(Object)
      );
    });
  });

  describe('getCommits', () => {
    it('should return commits with pagination metadata', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          values: [{ hash: 'abc123def456', message: 'Fix bug', author: { raw: 'Dev' }, date: '2023-01-01', parents: [], links: { html: { href: 'https://bitbucket.org' } } }],
          page: 1,
          pagelen: 10,
          next: 'https://api.bitbucket.org/2.0/repositories/ws/repo/commits?page=2',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getCommits('ws', 'repo');

      expect(result.commits).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.next).toBe('https://api.bitbucket.org/2.0/repositories/ws/repo/commits?page=2');
      expect(result.page).toBe(1);
      expect(result.pagelen).toBe(10);
    });

    it('should use opaque next URL directly when page starts with http', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getCommits(
        'ws',
        'repo',
        undefined,
        'https://api.bitbucket.org/2.0/repositories/ws/repo/commits?page=3&pagelen=25'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/commits?page=3&pagelen=25',
        expect.any(Object)
      );
    });

    it('should append branch to the URL when branch is provided', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getCommits('ws', 'repo', 'main');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/commits/main?pagelen=10',
        expect.any(Object)
      );
    });

    it('should support custom pagelen for commits', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getCommits('ws', 'repo', undefined, undefined, 50);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/commits?pagelen=50',
        expect.any(Object)
      );
    });

    it('should clamp commit pagelen to Bitbucket minimum', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ values: [], next: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await api.getCommits('ws', 'repo', undefined, undefined, 1);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/ws/repo/commits?pagelen=10',
        expect.any(Object)
      );
    });
  });

  describe('Pipelines', () => {
    describe('listPipelines', () => {
      it('should return a list of pipelines', async () => {
        const mockPipelines = [
          {
            uuid: '{pipeline-uuid}',
            build_number: 1,
            creator: { display_name: 'Test User', username: 'testuser' },
            state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } },
            created_on: '2024-01-01T00:00:00Z',
            updated_on: '2024-01-01T00:05:00Z',
            links: { html: { href: 'https://bitbucket.org/ws/repo/pipelines/1' } },
            target: { type: 'pipeline_ref_target', ref_type: 'branch', ref_name: 'main' }
          }
        ];

        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            values: mockPipelines,
            next: null,
            page: 1,
            pagelen: 10
          }),
        });

        const result = await api.listPipelines('ws', 'repo');

        expect(result.pipelines).toHaveLength(1);
        expect(result.pipelines[0].build_number).toBe(1);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.bitbucket.org/2.0/repositories/ws/repo/pipelines/?pagelen=10&sort=-created_on',
          expect.any(Object)
        );
      });
    });

    describe('triggerPipeline', () => {
      it('should trigger a pipeline with branch target', async () => {
        const mockPipeline = {
          uuid: '{new-pipeline-uuid}',
          build_number: 2,
          state: { name: 'PENDING' },
          created_on: '2024-03-28T00:00:00Z',
          links: { html: { href: 'https://bitbucket.org/ws/repo/pipelines/2' } }
        };

        mockFetch.mockResolvedValue({
          ok: true,
          status: 201,
          json: vi.fn().mockResolvedValue(mockPipeline),
        });

        const result = await api.triggerPipeline('ws', 'repo', {
          ref_type: 'branch',
          ref_name: 'main',
          variables: [{ key: 'VAR1', value: 'VAL1' }]
        });

        expect(result.build_number).toBe(2);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.bitbucket.org/2.0/repositories/ws/repo/pipelines/',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              target: {
                type: 'pipeline_ref_target',
                ref_type: 'branch',
                ref_name: 'main'
              },
              variables: [{ key: 'VAR1', value: 'VAL1' }]
            })
          })
        );
      });

      it('should trigger a pipeline with commit target', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 201,
          json: vi.fn().mockResolvedValue({ uuid: 'uuid' }),
        });

        await api.triggerPipeline('ws', 'repo', {
          commit_hash: 'abcdef123456'
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({
              target: {
                type: 'pipeline_commit_target',
                commit: {
                  type: 'commit',
                  hash: 'abcdef123456'
                }
              }
            })
          })
        );
      });

      it('should trigger a pipeline with branch target and explicit commit', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 201,
          json: vi.fn().mockResolvedValue({ uuid: 'uuid' }),
        });

        await api.triggerPipeline('ws', 'repo', {
          ref_type: 'branch',
          ref_name: 'main',
          commit_hash: 'abcdef123456'
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({
              target: {
                type: 'pipeline_ref_target',
                ref_type: 'branch',
                ref_name: 'main',
                commit: {
                  type: 'commit',
                  hash: 'abcdef123456'
                }
              }
            })
          })
        );
      });

      it('should support custom selector', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 201,
          json: vi.fn().mockResolvedValue({ uuid: 'uuid' }),
        });

        await api.triggerPipeline('ws', 'repo', {
          ref_type: 'branch',
          ref_name: 'main',
          selector_type: 'custom',
          selector_pattern: 'Deploy'
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('"selector":{"type":"custom","pattern":"Deploy"}')
          })
        );
      });
    });
  });
});

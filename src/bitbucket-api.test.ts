import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BitbucketAPI } from './bitbucket-api.js';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('BitbucketAPI', () => {
  let api: BitbucketAPI;

  beforeEach(() => {
    api = new BitbucketAPI();
    vi.clearAllMocks();
    // Mock console.error to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
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
          method: undefined, // GET is default
          headers: expect.objectContaining({
            'Accept': 'application/json',
            'User-Agent': 'bitbucket-mcp-server/1.0',
          }),
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

  describe('createRepository', () => {
    it('should create a new repository', async () => {
      const repoData = {
        name: 'new-repo',
        description: 'A new repository',
        is_private: true,
        language: 'JavaScript',
        has_issues: true,
        has_wiki: false,
        fork_policy: 'allow_forks',
        scm: 'git',
      };

      const mockCreatedRepo = {
        uuid: 'new-uuid',
        name: 'new-repo',
        full_name: 'workspace/new-repo',
        description: 'A new repository',
        is_private: true,
        created_on: new Date().toISOString(),
        updated_on: new Date().toISOString(),
        size: 0,
        language: 'JavaScript',
        owner: {
          display_name: 'Test User',
          username: 'testuser',
        },
        links: {
          html: { href: 'https://bitbucket.org/workspace/new-repo' },
          clone: [
            { name: 'https', href: 'https://bitbucket.org/workspace/new-repo.git' },
            { name: 'ssh', href: 'git@bitbucket.org:workspace/new-repo.git' },
          ],
        },
      };

      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue(mockCreatedRepo),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.createRepository('testworkspace', repoData);
      
      expect(result).toEqual(mockCreatedRepo);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/new-repo',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(repoData),
        })
      );
    });
  });

  describe('updateRepository', () => {
    it('should update repository settings', async () => {
      const updateData = {
        description: 'Updated description',
        is_private: false,
      };

      const mockUpdatedRepo = {
        uuid: 'test-uuid',
        name: 'test-repo',
        full_name: 'workspace/test-repo',
        description: 'Updated description',
        is_private: false,
        created_on: '2023-01-01T00:00:00Z',
        updated_on: new Date().toISOString(),
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
        json: vi.fn().mockResolvedValue(mockUpdatedRepo),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.updateRepository('testworkspace', 'test-repo', updateData);
      
      expect(result).toEqual(mockUpdatedRepo);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bitbucket.org/2.0/repositories/testworkspace/test-repo',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(updateData),
        })
      );
    });
  });
});

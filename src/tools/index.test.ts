import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { registerTools } from './index.js';

type RegisteredTool = {
  schema: Record<string, z.ZodTypeAny>;
  handler: (args: any) => Promise<any>;
};

class FakeServer {
  tools = new Map<string, RegisteredTool>();

  tool(name: string, _description: string, schema: Record<string, z.ZodTypeAny>, handler: (args: any) => Promise<any>) {
    this.tools.set(name, { schema, handler });
  }
}

function buildInput(schema: Record<string, z.ZodTypeAny>, input: Record<string, unknown>) {
  return z.object(schema).parse(input);
}

const originalWorkspaceEnv = process.env.BITBUCKET_WORKSPACE;

describe('registerTools', () => {
  it('keeps list-pull-requests compatible with a single state value', async () => {
    const server = new FakeServer();
    registerTools(server as any, {} as any);

    const tool = server.tools.get('list-pull-requests');
    expect(tool).toBeDefined();

    expect(() =>
      buildInput(tool!.schema, {
        workspace: 'ws',
        repo_slug: 'repo',
        state: 'OPEN',
      })
    ).not.toThrow();
  });

  it('returns all commits on the page when pagelen is specified for get-commits', async () => {
    const server = new FakeServer();
    const bitbucketAPI = {
      getCommits: vi.fn().mockResolvedValue({
        commits: Array.from({ length: 50 }, (_, index) => ({
          hash: `hash${index}`.padEnd(12, '0'),
          message: `Commit ${index}`,
          author: { raw: 'Dev' },
          date: '2023-01-01T00:00:00Z',
          links: { html: { href: `https://example.com/commit/${index}` } },
        })),
        hasMore: true,
        next: 'https://api.bitbucket.org/2.0/repositories/ws/repo/commits?page=2&pagelen=50',
        page: 1,
        pagelen: 50,
      }),
    };

    registerTools(server as any, bitbucketAPI as any);
    const tool = server.tools.get('get-commits');
    expect(tool).toBeDefined();

    const input = buildInput(tool!.schema, {
      workspace: 'ws',
      repo_slug: 'repo',
      pagelen: 50,
    });

    const result = await tool!.handler(input);
    expect(result.content[0].text).toContain("Found 50 recent commits in 'ws/repo'");
  });

  it('uses the resolved workspace in error messages when workspace comes from BITBUCKET_WORKSPACE', async () => {
    process.env.BITBUCKET_WORKSPACE = 'env-workspace';
    process.env.BITBUCKET_API_TOKEN = 'test-token';

    const apiError = new Error('simulated failure');
    const bitbucketAPI = {
      getPullRequestDiff: vi.fn().mockRejectedValue(apiError),
      createPullRequestComment: vi.fn().mockRejectedValue(apiError),
      getBranches: vi.fn().mockRejectedValue(apiError),
      getPullRequest: vi.fn().mockRejectedValue(apiError),
      createPullRequest: vi.fn().mockRejectedValue(apiError),
    };

    const server = new FakeServer();
    registerTools(server as any, bitbucketAPI as any);

    const cases = [
      {
        toolName: 'get-pr-diff',
        input: { repo_slug: 'repo', pull_request_id: 123 },
      },
      {
        toolName: 'create-pr-comment',
        input: { repo_slug: 'repo', pull_request_id: 123, content: 'hello' },
      },
      {
        toolName: 'list-branches',
        input: { repo_slug: 'repo' },
      },
      {
        toolName: 'get-pull-request',
        input: { repo_slug: 'repo', pull_request_id: 123 },
      },
      {
        toolName: 'create-pull-request',
        input: {
          repo_slug: 'repo',
          title: 'Test PR',
          source_branch: 'feature/test',
          destination_branch: 'main',
        },
      },
    ];

    for (const testCase of cases) {
      const tool = server.tools.get(testCase.toolName);
      expect(tool).toBeDefined();

      const parsedInput = buildInput(tool!.schema, testCase.input);
      const result = await tool!.handler(parsedInput);
      expect(result.content[0].text).toContain("'env-workspace/repo'");
      expect(result.content[0].text).not.toContain("'undefined/repo'");
    }

    delete process.env.BITBUCKET_API_TOKEN;
    if (originalWorkspaceEnv === undefined) {
      delete process.env.BITBUCKET_WORKSPACE;
    } else {
      process.env.BITBUCKET_WORKSPACE = originalWorkspaceEnv;
    }
  });

  describe('Pipelines', () => {
    it('triggers a pipeline with variables correctly', async () => {
      const server = new FakeServer();
      const bitbucketAPI = {
        triggerPipeline: vi.fn().mockResolvedValue({
          build_number: 123,
          uuid: '{uuid}',
          state: { name: 'SUCCESSFUL' },
          created_on: '2024-03-28T00:00:00Z',
          links: { html: { href: 'https://example.com' } }
        }),
      };
      process.env.BITBUCKET_API_TOKEN = 'test-token';

      registerTools(server as any, bitbucketAPI as any);
      const tool = server.tools.get('trigger-pipeline');
      expect(tool).toBeDefined();

      const input = buildInput(tool!.schema, {
        workspace: 'ws',
        repo_slug: 'repo',
        ref_type: 'branch',
        ref_name: 'main',
        variables: {
          DEBUG: 'true',
          ENV: 'production'
        }
      });

      const result = await tool!.handler(input);
      expect(bitbucketAPI.triggerPipeline).toHaveBeenCalledWith('ws', 'repo', expect.objectContaining({
        variables: [
          { key: 'DEBUG', value: 'true' },
          { key: 'ENV', value: 'production' }
        ]
      }));
      expect(result.content[0].text).toContain('Pipeline #123');
      
      delete process.env.BITBUCKET_API_TOKEN;
    });

    it('rejects partial selector parameters', async () => {
      const server = new FakeServer();
      const bitbucketAPI = {
        triggerPipeline: vi.fn(),
      };
      process.env.BITBUCKET_API_TOKEN = 'test-token';

      registerTools(server as any, bitbucketAPI as any);
      const tool = server.tools.get('trigger-pipeline');
      expect(tool).toBeDefined();

      const input = buildInput(tool!.schema, {
        workspace: 'ws',
        repo_slug: 'repo',
        ref_type: 'branch',
        ref_name: 'main',
        selector_type: 'custom'
      });

      const result = await tool!.handler(input);
      expect(result.content[0].text).toContain('❌ Invalid parameters');
      expect(result.content[0].text).toContain('must provide both \'selector_type\' and \'selector_pattern\'');
      expect(bitbucketAPI.triggerPipeline).not.toHaveBeenCalled();
      
      delete process.env.BITBUCKET_API_TOKEN;
    });

    it('handles missing links or other properties in list-pipelines gracefully', async () => {
      const server = new FakeServer();
      const bitbucketAPI = {
        listPipelines: vi.fn().mockResolvedValue({
          pipelines: [
            {
              build_number: 1,
              uuid: '{uuid1}',
              // state is missing or incomplete
              // target is missing
              // creator is missing
              // links is missing
            }
          ],
          hasMore: false
        }),
      };
      process.env.BITBUCKET_API_TOKEN = 'test-token';

      registerTools(server as any, bitbucketAPI as any);
      const tool = server.tools.get('list-pipelines');
      expect(tool).toBeDefined();

      const input = buildInput(tool!.schema, {
        workspace: 'ws',
        repo_slug: 'repo',
      });

      const result = await tool!.handler(input);
      expect(result.content[0].text).toContain('Pipeline #1');
      expect(result.content[0].text).toContain('Status: unknown');
      expect(result.content[0].text).toContain('URL: N/A');
      
      delete process.env.BITBUCKET_API_TOKEN;
    });
  });
});

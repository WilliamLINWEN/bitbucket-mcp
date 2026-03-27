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
});
